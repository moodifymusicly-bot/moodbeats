"""GET /api/recommendations/home bundles sections (mocked service)."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_recommend_home_calls_get_home_feed():
    from app.routers import recommendations as rec_router
    from app.models.user import User

    uid = uuid.uuid4()
    user = User(id=uid, clerk_id="x", email="a@b.com", username=None)

    fake_bundle = {
        "for_you": [],
        "last_played": [],
        "most_played": [],
        "mood_starter": [],
        "cold_start": True,
        "interaction_count": 0,
        "starter_mood": "happy",
    }

    with patch(
        "app.routers.recommendations.get_home_feed",
        new_callable=AsyncMock,
        return_value=fake_bundle,
    ) as gh:
        resp = await rec_router.recommend_home(
            starter_mood="happy",
            mood_limit=8,
            foryou_limit=10,
            history_limit=6,
            current_user=user,
            db=AsyncMock(),
        )
        gh.assert_awaited_once()
        assert resp.cold_start is True
        assert resp.interaction_count == 0
        assert resp.starter_mood == "happy"
