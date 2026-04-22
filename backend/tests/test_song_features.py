"""Audio-feature inference for YouTube upserts.

We don't test the DB path here (that's integration). We assert that
`_infer_features` produces values in the right range per mood so the
recommender's mood-match math stays predictable.
"""

import pytest

from app.services.song_service import (
    DEFAULT_MOOD_TAG,
    _MOOD_FEATURE_RANGES,
    _infer_features,
)


@pytest.mark.parametrize("mood", list(_MOOD_FEATURE_RANGES.keys()))
def test_infer_features_in_range(mood):
    for _ in range(25):
        f = _infer_features(mood)
        ranges = _MOOD_FEATURE_RANGES[mood]
        assert ranges["valence"][0] <= f["valence"] <= ranges["valence"][1]
        assert ranges["energy"][0] <= f["energy"] <= ranges["energy"][1]
        assert ranges["dance"][0] <= f["danceability"] <= ranges["dance"][1]


def test_infer_features_unknown_mood_is_neutral():
    f = _infer_features("not-a-mood")
    assert f["valence"] == 0.5
    assert f["energy"] == 0.5
    assert f["danceability"] == 0.5


def test_infer_features_none_is_neutral():
    f = _infer_features(None)
    assert f["valence"] == 0.5


def test_default_mood_tag_not_happy():
    assert DEFAULT_MOOD_TAG == "unknown"
