"""Clerk JWT verification via mocked JWKS."""

import base64
import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from jose import jwt


def _b64url_uint(n: int) -> str:
    length = (n.bit_length() + 7) // 8
    return base64.urlsafe_b64encode(n.to_bytes(length, "big")).rstrip(b"=").decode()


def _rsa_keypair_and_jwk(kid: str = "test-kid"):
    """Generate an RS256 keypair and return (private_pem, public_jwk)."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    numbers = key.public_key().public_numbers()
    public_jwk = {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": kid,
        "n": _b64url_uint(numbers.n),
        "e": _b64url_uint(numbers.e),
    }
    return private_pem, public_jwk


def _sign(claims: dict, private_pem: str, kid: str = "test-kid") -> str:
    return jwt.encode(
        claims, private_pem, algorithm="RS256", headers={"kid": kid}
    )


@pytest.fixture
def clerk_keys(monkeypatch):
    from app.services import auth_service

    private_pem, public_jwk = _rsa_keypair_and_jwk()

    async def _fake_fetch_jwks(url: str):
        return {"keys": [public_jwk]}

    monkeypatch.setattr(auth_service, "_fetch_jwks", _fake_fetch_jwks)
    auth_service._jwks_cache.clear()
    return private_pem, public_jwk


@pytest.mark.asyncio
async def test_verify_valid_token(clerk_keys):
    from app.config import get_settings
    from app.services.auth_service import _verify_clerk_token

    private_pem, _ = clerk_keys
    settings = get_settings()
    now = int(time.time())
    token = _sign(
        {
            "iss": settings.CLERK_ISSUER,
            "sub": "user_abc123",
            "iat": now,
            "exp": now + 300,
        },
        private_pem,
    )
    payload = await _verify_clerk_token(token)
    assert payload["sub"] == "user_abc123"


@pytest.mark.asyncio
async def test_reject_expired_token(clerk_keys):
    from app.config import get_settings
    from app.services.auth_service import _verify_clerk_token

    private_pem, _ = clerk_keys
    settings = get_settings()
    now = int(time.time())
    token = _sign(
        {
            "iss": settings.CLERK_ISSUER,
            "sub": "user_abc123",
            "iat": now - 600,
            "exp": now - 300,
        },
        private_pem,
    )
    with pytest.raises(HTTPException) as exc:
        await _verify_clerk_token(token)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_reject_token_with_unknown_kid(clerk_keys):
    from app.services.auth_service import _verify_clerk_token

    private_pem, _ = clerk_keys
    now = int(time.time())
    token = _sign(
        {"sub": "u", "iat": now, "exp": now + 60},
        private_pem,
        kid="some-other-kid",
    )
    with pytest.raises(HTTPException) as exc:
        await _verify_clerk_token(token)
    assert exc.value.status_code == 401
