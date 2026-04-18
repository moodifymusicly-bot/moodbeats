from pydantic import BaseModel
from datetime import datetime
import uuid


class UserResponse(BaseModel):
    id: uuid.UUID
    clerk_id: str | None = None
    username: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True
