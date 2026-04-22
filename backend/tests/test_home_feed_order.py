"""Home feed section ordering and deduplication (mocked DB + reco deps)."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_home_feed_prefers_last_played_over_for_you_dedupe():
    from app.services.recommendation_service import get_home_feed

    uid = uuid.uuid4()
    song = MagicMock()
    song.id = uuid.uuid4()
    row = {
        "song": song,
        "score": 1.0,
        "mood_match": 0.5,
        "user_similarity": 0.5,
    }
    same_for_you = [row]

    with (
        patch(
            "app.services.recommendation_service.count_user_interactions",
            new_callable=AsyncMock,
            return_value=100,
        ),
        patch(
            "app.services.recommendation_service.get_for_you_recommendations",
            new_callable=AsyncMock,
            return_value=(same_for_you, False),
        ),
        patch(
            "app.services.recommendation_service.get_last_played_songs_cached",
            new_callable=AsyncMock,
            return_value=[song],
        ),
        patch(
            "app.services.recommendation_service.get_most_played_songs_cached",
            new_callable=AsyncMock,
            return_value=[],
        ),
    ):
        out = await get_home_feed(
            AsyncMock(),
            uid,
            starter_mood="happy",
            mood_limit=8,
            foryou_limit=10,
            history_limit=6,
        )
    assert len(out["last_played"]) == 1
    assert out["last_played"][0]["song"] is song
    assert len(out["for_you"]) == 0


@pytest.mark.asyncio
async def test_recommend_home_omitted_starter_defaults_to_study():
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
        "starter_mood": "study",
    }

    with patch(
        "app.routers.recommendations.get_home_feed",
        new_callable=AsyncMock,
        return_value=fake_bundle,
    ) as gh:
        resp = await rec_router.recommend_home(
            starter_mood=None,
            mood_limit=8,
            foryou_limit=10,
            history_limit=6,
            current_user=user,
            db=AsyncMock(),
        )
        assert resp.starter_mood == "study"
        assert gh.await_args.kwargs["starter_mood"] == "study"
