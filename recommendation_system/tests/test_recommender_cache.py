"""Recommender serialization roundtrip: cache -> dict -> attribute access."""

import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest


def _fake_song(**overrides):
    base = {
        "id": uuid.uuid4(),
        "title": "T",
        "artist": "A",
        "album": "Alb",
        "genre": "pop",
        "mood_tag": "happy",
        "duration": 180,
        "cover_url": None,
        "audio_url": None,
        "preview_url": None,
        "valence": 0.5,
        "energy": 0.5,
        "danceability": 0.5,
        "popularity": 60,
        "release_date": datetime(2024, 1, 1),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_serialize_deserialize_roundtrip():
    from recommendation_system.services.recommendation_service import (
        _deserialize_results,
        _serialize_results,
    )

    orig = [
        {
            "song": _fake_song(),
            "score": 0.8,
            "mood_match": 0.7,
            "user_similarity": 0.6,
        }
    ]
    blob = _serialize_results(orig)
    round_tripped = _deserialize_results(blob)
    assert len(round_tripped) == 1
    r = round_tripped[0]
    assert r["score"] == 0.8
    assert r["song"].title == "T"
    assert r["song"].mood_tag == "happy"
    assert isinstance(r["song"].id, uuid.UUID)
    assert r["song"].release_date.year == 2024


def test_blend_popularity_prefers_live_counters():
    from recommendation_system.services.recommendation_service import _blend_popularity

    song = _fake_song(popularity=40)  # base 0.4
    live = {song.id: 1.0}
    assert _blend_popularity(song, live) == pytest.approx(
        0.3 * 0.4 + 0.7 * 1.0, rel=1e-3
    )


def test_blend_popularity_falls_back_to_db_when_no_live_data():
    from recommendation_system.services.recommendation_service import _blend_popularity

    song = _fake_song(popularity=80)
    assert _blend_popularity(song, {}) == pytest.approx(0.8, rel=1e-3)


def test_mood_reco_cache_key_includes_user_segment():
    import uuid

    from recommendation_system.services.recommendation_service import mood_reco_cache_key

    uid = uuid.uuid4()
    assert mood_reco_cache_key("happy", 20, None) == "mb:reco:mood:happy:20:u:anon"
    assert mood_reco_cache_key("happy", 20, uid) == f"mb:reco:mood:happy:20:u:{uid}"
    assert mood_reco_cache_key("happy", 20, None, True) == (
        "mb:reco:mood:happy:20:u:anon:seed"
    )
