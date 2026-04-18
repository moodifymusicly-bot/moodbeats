"""Clerk-based authentication.

Verifies short-lived Clerk session JWTs using the tenant's published JWKS.
The JWKS document (a few KB, rotates rarely) is cached in-process with a
`TTLCache` -- this avoids a Redis hop on every authenticated request and
keeps auth latency dominated by the JWT signature check (~1ms).
"""

from __future__ import annotations

import logging
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

from app.config import get_settings
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
settings = get_settings()

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)

# Single-entry cache keyed by JWKS URL. maxsize=4 in case the URL is switched in
# tests; ttl is configurable but defaults to 1h.
_jwks_cache: TTLCache[str, dict[str, Any]] = TTLCache(
    maxsize=4, ttl=settings.CLERK_JWKS_TTL_SECONDS
)


async def _fetch_jwks(url: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=settings.CLERK_JWKS_HTTP_TIMEOUT_SECONDS) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.json()


async def _get_jwks() -> dict[str, Any]:
    url = settings.CLERK_JWKS_URL
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
    """Return decoded payload or raise 401."""
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
        # Cache may be stale after a key rotation; force a refresh once.
        _jwks_cache.pop(settings.CLERK_JWKS_URL, None)
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
            # Clerk session tokens don't carry an `aud` by default; validation by
            # issuer + signature + expiry is sufficient.
            options={"verify_aud": False},
            issuer=settings.CLERK_ISSUER or None,
        )
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Token missing sub claim")
    return payload


def _derive_email(payload: dict[str, Any]) -> str | None:
    email = payload.get("email")
    if email:
        return str(email)
    claims_email = payload.get("primary_email_address_id")
    if claims_email:
        return None  # email not embedded; leave blank, pulled on demand later
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


async def _upsert_user_from_clerk(payload: dict[str, Any], db: AsyncSession) -> User:
    clerk_id = str(payload["sub"])
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()

    email = _derive_email(payload) or f"{clerk_id}@moodbeats.local"
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
            # Race: another concurrent request created the user. Re-query and continue.
            await db.rollback()
            result = await db.execute(select(User).where(User.clerk_id == clerk_id))
            user = result.scalar_one()
        else:
            await db.refresh(user)
        return user

    # Keep profile fields mostly in sync on sign-in; never clobber with empties.
    changed = False
    if email and user.email != email and not email.endswith("@moodbeats.local"):
        user.email = email
        changed = True
    if username and user.username != username:
        # Only update username if it doesn't conflict with another user.
        existing = await db.execute(
            select(User).where(User.username == username, User.id != user.id)
        )
        if existing.scalar_one_or_none() is None:
            user.username = username
            changed = True
    if changed:
        await db.flush()
    return user


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    payload = await _verify_clerk_token(credentials.credentials)
    return await _upsert_user_from_clerk(payload, db)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    try:
        payload = await _verify_clerk_token(credentials.credentials)
    except HTTPException:
        return None
    try:
        return await _upsert_user_from_clerk(payload, db)
    except Exception:
        logger.exception("Failed to upsert Clerk user (optional auth)")
        return None
