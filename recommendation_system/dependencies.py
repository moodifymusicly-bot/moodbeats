"""FastAPI dependencies for the standalone recommendation service.

Provides:
  - ``get_current_user``          — required auth (raises 401 if missing/invalid)
  - ``get_current_user_optional`` — optional auth (returns None for anonymous)
  - ``resolve_seed_youtube_id``   — seed-catalog YouTube ID lookup (pure function)

All auth logic mirrors ``backend/app/services/auth_service.py`` exactly: Clerk
JWKS verification, in-process TTLCache, and user upsert from the ``app.models``
ORM (resolved via ``PYTHONPATH=/app/backend`` inside the Docker container).

This module must **never** import from ``app.*`` — it is only loaded when the
service runs standalone.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

import httpx
from cachetools import TTLCache
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from recommendation_system.config import get_reco_settings
from recommendation_system.database import get_db

# ORM models live in backend/app/models/ — resolved via PYTHONPATH in the container.
from app.models.user import User  # noqa: E402  (PYTHONPATH must include backend/)

logger = logging.getLogger(__name__)
_settings = get_reco_settings()

# ---------------------------------------------------------------------------
# HTTP Bearer extractors
# ---------------------------------------------------------------------------
_security = HTTPBearer()
_security_optional = HTTPBearer(auto_error=False)

# Single-entry in-process JWKS cache (TTL = CLERK_JWKS_TTL_SECONDS, default 1 h).
_jwks_cache: TTLCache[str, dict[str, Any]] = TTLCache(
    maxsize=4, ttl=_settings.CLERK_JWKS_TTL_SECONDS
)


# ---------------------------------------------------------------------------
# JWKS helpers
# ---------------------------------------------------------------------------

async def _fetch_jwks(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=_settings.CLERK_JWKS_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


async def _get_jwks() -> dict[str, Any]:
    url = _settings.CLERK_JWKS_URL
    if not url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth provider not configured (missing CLERK_JWKS_URL)",
        )
    cached = _jwks_cache.get(url)
    if cached is not None:
        return cached
    try:
        jwks = await _fetch_jwks(url)
    except httpx.HTTPError as exc:
        logger.error("Failed to fetch Clerk JWKS from %s: %s", url, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify authentication token",
        ) from exc
    _jwks_cache[url] = jwks
    return jwks


def _find_signing_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def _verify_clerk_token(token: str) -> dict[str, Any]:
    """Return decoded JWT payload or raise HTTP 401."""
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Malformed token") from exc

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token header missing kid")

    jwks = await _get_jwks()
    key = _find_signing_key(jwks, kid)
    if key is None:
        # Cache may be stale after a key rotation; force a single refresh.
        _jwks_cache.pop(_settings.CLERK_JWKS_URL, None)
        jwks = await _get_jwks()
        key = _find_signing_key(jwks, kid)
        if key is None:
            raise HTTPException(status_code=401, detail="Unknown signing key")

    algorithms = [header.get("alg", "RS256")]
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=algorithms,
            options={"verify_aud": False},
            issuer=_settings.CLERK_ISSUER or None,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Token missing sub claim")
    return payload


# ---------------------------------------------------------------------------
# User upsert helpers (mirrors auth_service.py exactly)
# ---------------------------------------------------------------------------

def _derive_email(payload: dict[str, Any]) -> str | None:
    email = payload.get("email")
    if email:
        return str(email)
    return None


def _derive_username(payload: dict[str, Any], fallback_clerk_id: str) -> str:
    for key in ("username", "preferred_username", "nickname", "given_name"):
        v = payload.get(key)
        if v:
            return str(v)
    email = payload.get("email")
    if email:
        return str(email).split("@")[0]
    return f"user_{fallback_clerk_id[:8]}"


async def _upsert_user(payload: dict[str, Any], db: AsyncSession) -> User:
    clerk_id = str(payload["sub"])
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    email = _derive_email(payload) or f"{clerk_id}@moodbeatz.local"
    username = _derive_username(payload, clerk_id)

    if user is None:
        user = User(
            clerk_id=clerk_id,
            username=username,
            email=email,
            hashed_password=None,
            is_active=True,
        )
        db.add(user)
        try:
            await db.flush()
        except Exception:
            await db.rollback()
            result = await db.execute(select(User).where(User.clerk_id == clerk_id))
            user = result.scalar_one()
        else:
            await db.refresh(user)
        return user

    changed = False
    if email and user.email != email and not email.endswith("@moodbeatz.local"):
        user.email = email
        changed = True
    if username and user.username != username:
        existing = await db.execute(
            select(User).where(User.username == username, User.id != user.id)
        )
        if existing.scalar_one_or_none() is None:
            user.username = username
            changed = True
    if changed:
        await db.flush()
    return user


# ---------------------------------------------------------------------------
# Public FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Require a valid Clerk JWT. Raises 401 on any failure."""
    payload = await _verify_clerk_token(credentials.credentials)
    return await _upsert_user(payload, db)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_security_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Accept an optional Clerk JWT. Returns ``None`` for anonymous requests."""
    if not credentials:
        return None
    try:
        payload = await _verify_clerk_token(credentials.credentials)
    except HTTPException:
        return None
    try:
        return await _upsert_user(payload, db)
    except Exception:
        logger.exception("Failed to upsert Clerk user (optional auth)")
        return None


# ---------------------------------------------------------------------------
# YouTube seed-catalog lookup (pure function — no network, no DB)
# ---------------------------------------------------------------------------

def _norm(x: str) -> str:
    x = x.lower().strip()
    x = re.sub(r"[^a-z0-9]+", " ", x)
    return re.sub(r"\s+", " ", x).strip()


def _seed_key(title: str, artist: str) -> str:
    return f"{_norm(title)}|{_norm(artist)}"


# Inline copy of the seed-catalog map from
# ``backend/app/services/youtube_seed_resolve.py``.
# Kept in sync manually; any changes to the backend file must be mirrored here.
_SEED_YOUTUBE_IDS: dict[str, str] = {
    # --- Happy / Upbeat ---
    _seed_key("Happy", "Pharrell Williams"): "y6Sxv-sUYtM",
    _seed_key("Sugar", "Maroon 5"): "09R8_2nJtjg",
    _seed_key("Uptown Funk", "Bruno Mars ft. Mark Ronson"): "OPf0YbXqDm0",
    _seed_key("Uptown Funk", "Mark Ronson ft. Bruno Mars"): "OPf0YbXqDm0",
    _seed_key("Dynamite", "BTS"): "gdZLi9oWNZg",
    _seed_key("Levitating", "Dua Lipa"): "TUVcZfQe-Kw",
    _seed_key("Good as Hell", "Lizzo"): "SmbmeOgGsW4",
    _seed_key("Can't Stop the Feeling", "Justin Timberlake"): "ru0K8uLPyzE",
    _seed_key("Shake It Off", "Taylor Swift"): "nfWlot6h_JM",
    _seed_key("Shut Up and Dance", "WALK THE MOON"): "6JCLY0Rlx6Q",
    _seed_key("Roar", "Katy Perry"): "CevxZvSJLk8",
    _seed_key("Happy Together", "The Turtles"): "9ZEROcOHHCQ",
    _seed_key("Walking on Sunshine", "Katrina and the Waves"): "iPUmE-tne5U",
    _seed_key("I Gotta Feeling", "The Black Eyed Peas"): "uSD4vsh1zDA",
    _seed_key("Believer", "Imagine Dragons"): "7wtfhZwyrcc",
    # --- Sad / Melancholic ---
    _seed_key("Someone Like You", "Adele"): "hLQl3WQQoQ0",
    _seed_key("Creep", "Radiohead"): "XFkzRNyygfk",
    _seed_key("Let Her Go", "Passenger"): "RBumgq5yVrA",
    _seed_key("Photograph", "Ed Sheeran"): "nSDgHBxUbVQ",
    _seed_key("The Night We Met", "Lord Huron"): "KtlgYxa6BMU",
    _seed_key("Skinny Love", "Bon Iver"): "ssdgFoHLwnk",
    _seed_key("Fix You", "Coldplay"): "k4V3Mo61fJM",
    _seed_key("The Scientist", "Coldplay"): "RB-RcX5DS5A",
    _seed_key("Hallelujah", "Jeff Buckley"): "y8AWFf7EAc4",
    _seed_key("All I Want", "Kodaline"): "4CHMxMa3CfI",
    _seed_key("Liability", "Lorde"): "bXNoMF5qlSQ",
    _seed_key("Wrecking Ball", "Miley Cyrus"): "My2FRPA3Gf8",
    _seed_key("When the Party's Over", "Billie Eilish"): "pbMwTqkKSps",
    _seed_key("Ocean Eyes", "Billie Eilish"): "viimfQi_pUw",
    # --- Gym / High Energy ---
    _seed_key("Stronger", "Kanye West"): "PsO6ZnUZI0g",
    _seed_key("Till I Collapse", "Eminem"): "Obim8BYGnOE",
    _seed_key("Radioactive", "Imagine Dragons"): "ktvTqknDobU",
    _seed_key("Faded", "Alan Walker"): "60ItHLz5WEA",
    _seed_key("Thunderstruck", "AC/DC"): "v2AC41dglnM",
    _seed_key("Eye of the Tiger", "Survivor"): "btPJPFnesV4",
    _seed_key("Lose Yourself", "Eminem"): "_Yhyp-_hX2s",
    _seed_key("Power", "Kanye West"): "L53gjP-TtGE",
    _seed_key("Can't Hold Us", "Macklemore & Ryan Lewis"): "hlVBg7_08n0",
    _seed_key("Jump Around", "House of Pain"): "idoSSqdCkBA",
    _seed_key("Pump It", "The Black Eyed Peas"): "ZbZSe6N_BXs",
    _seed_key("Remember the Name", "Fort Minor"): "VDvr08sCPOc",
    _seed_key("Numb/Encore", "Linkin Park & Jay-Z"): "fMDSbLB8kow",
    _seed_key("Rap God", "Eminem"): "XbGs_qK2PQA",
    # --- Study / Chill / Ambient ---
    _seed_key("Weightless", "Marconi Union"): "UfcAVejslrU",
    _seed_key("Clair de Lune", "Claude Debussy"): "CvFH_6DNRCY",
    _seed_key("Experience", "Ludovico Einaudi"): "hN_q-_jI-uc",
    _seed_key("Intro", "The xx"): "qkk5wViJo-I",
    _seed_key("Comptine d'un autre été", "Yann Tiersen"): "Qhh0geBiVRI",
    _seed_key("Gymnopédie No. 1", "Erik Satie"): "S-Xm7s9eGxU",
    _seed_key("Divenire", "Ludovico Einaudi"): "4RCfuMHqMbU",
    _seed_key("Retrograde", "James Blake"): "6VEP5J_HzBg",
    _seed_key("Northern Lights", "Tycho"): "y6RBg_BLDXU",
    _seed_key("Awake", "Tycho"): "S-oA_gLnSPc",
    _seed_key("Hours", "Tycho"): "wBP6NrJf38I",
    _seed_key("Re:Stacks", "Bon Iver"): "VO-CUH97nDg",
    _seed_key("Spiegel im Spiegel", "Arvo Pärt"): "TJ6Mzvh3XCc",
    _seed_key("On the Nature of Daylight", "Max Richter"): "b_YHM4gR9qk",
    _seed_key("My Body Is a Cage", "Arcade Fire"): "OZiMR3vVq78",
    # --- Rock ---
    _seed_key("Blinding Lights", "The Weeknd"): "4NRXx6U8ABQ",
    _seed_key("Sunflower", "Post Malone & Swae Lee"): "ApXoWvfEYVU",
    _seed_key("Sweet Child O' Mine", "Guns N' Roses"): "1w7OgIMMRc4",
    _seed_key("Bohemian Rhapsody", "Queen"): "fJ9rUzIMcZQ",
    _seed_key("Stairway to Heaven", "Led Zeppelin"): "D9ioyEvdggk",
    _seed_key("Hotel California", "Eagles"): "BciS5krYL80",
    _seed_key("Smells Like Teen Spirit", "Nirvana"): "hTWKbfoikeg",
    _seed_key("Come as You Are", "Nirvana"): "vabnZ9-ex7o",
    _seed_key("Black", "Pearl Jam"): "A-ELiUgSM74",
    _seed_key("Black Hole Sun", "Soundgarden"): "3mbBbFH9fAg",
    _seed_key("Mr. Brightside", "The Killers"): "gGdGFtwCNBE",
    _seed_key("Human", "The Killers"): "RIZdjT9SCNU",
    _seed_key("Seven Nation Army", "The White Stripes"): "0J2QdDbelmY",
    _seed_key("Feel Good Inc.", "Gorillaz"): "HyHNuVaZJ-k",
    _seed_key("Take Me Out", "Franz Ferdinand"): "FX85S3mHRFM",
    _seed_key("Reptilia", "The Strokes"): "cFEt2bLJqpQ",
    _seed_key("Last Nite", "The Strokes"): "ToIdVJpqhqc",
    _seed_key("Do I Wanna Know?", "Arctic Monkeys"): "bpOSxM0MsIk",
    _seed_key("R U Mine?", "Arctic Monkeys"): "The59I7CREAM",
    _seed_key("505", "Arctic Monkeys"): "C1dk4fDFJFE",
    _seed_key("Fluorescent Adolescent", "Arctic Monkeys"): "Q7dNELALJEU",
}


def resolve_seed_youtube_id(title: str, artist: str) -> str | None:
    """Return a known YouTube video ID for this seed track, or ``None``."""
    return _SEED_YOUTUBE_IDS.get(_seed_key(title, artist))
