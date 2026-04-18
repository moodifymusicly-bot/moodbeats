"""Clerk-only auth endpoints.

Password-based register/login are removed. The only endpoint here is `/me`
which returns the current user derived from the Clerk session JWT. The
`users` row is upserted on first authenticated request.
"""

from fastapi import APIRouter, Depends

from app.schemas.user import UserResponse
from app.services.auth_service import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
