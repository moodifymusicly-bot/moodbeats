"""Unit tests for recommendation-feed title deduplication.

Covers:
- _normalize_title: regex stripping of common version suffixes
- _dedupe_by_normalized_title: highest-score-wins grouping logic

Search endpoints are intentionally excluded from deduplication; these tests
verify that the helpers themselves are correct and isolated.
"""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest

from recommendation_system.services.recommendation_service import (
    _dedupe_by_normalized_title,
    _normalize_title,
)


# ---------------------------------------------------------------------------
# _normalize_title
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw, expected",
    [
        # No suffix — unchanged (lowercased + stripped)
        ("Blinding Lights", "blinding lights"),
        # Remix
        ("Blinding Lights (Remix)", "blinding lights"),
        # Live
        ("Hotel California (Live)", "hotel california"),
        # Acoustic
        ("Shape of You (Acoustic)", "shape of you"),
        # Remastered
        ("Hotel California (Remastered)", "hotel california"),
        # Radio edit
        ("Waterloo (Radio Edit)", "waterloo"),
        # feat. — simple
        ("Shallow (feat. Lady Gaga)", "shallow"),
        # feat. — complex artist name
        ("HUMBLE. (feat. Kendrick Lamar)", "humble."),
        # Extended
        ("Blue (Extended)", "blue"),
        # Instrumental
        ("Moonlight Sonata (Instrumental)", "moonlight sonata"),
        # Official
        ("Levitating (Official)", "levitating"),
        # Trailing year tag
        ("Shape of You - 2020", "shape of you"),
        ("Believer - 2017  ", "believer"),
        # Mixed case suffix
        ("Somebody (REMIX)", "somebody"),
        # Trailing whitespace in suffix
        ("Africa (Remastered )  ", "africa"),
        # Year tag with extra spaces
        ("Closer  -  2019", "closer"),
    ],
)
def test_normalize_title(raw: str, expected: str) -> None:
    assert _normalize_title(raw) == expected


# ---------------------------------------------------------------------------
# _dedupe_by_normalized_title
# ---------------------------------------------------------------------------

def _make_row(title: str, artist: str, score: float) -> dict:
    song = MagicMock()
    song.id = uuid.uuid4()
    song.title = title
    song.artist = artist
    return {"song": song, "score": score, "mood_match": 0.5, "user_similarity": 0.5}


def test_dedup_keeps_highest_score_version() -> None:
    """When two rows share a normalised key the first (highest score) survives."""
    rows = [
        _make_row("Blinding Lights", "The Weeknd", 0.95),
        _make_row("Blinding Lights (Remix)", "The Weeknd", 0.70),
        _make_row("Blinding Lights (Live)", "The Weeknd", 0.50),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 1
    assert result[0]["song"].title == "Blinding Lights"
    assert result[0]["score"] == pytest.approx(0.95)


def test_dedup_different_artists_not_merged() -> None:
    """Same normalised title but different artist → both entries kept."""
    rows = [
        _make_row("Hallelujah", "Jeff Buckley", 0.90),
        _make_row("Hallelujah (Live)", "Leonard Cohen", 0.85),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 2


def test_dedup_preserves_ranking_order() -> None:
    """Deduplication must not reorder the surviving entries."""
    rows = [
        _make_row("Song A", "Artist X", 0.99),
        _make_row("Song B", "Artist Y", 0.88),
        _make_row("Song A (Remix)", "Artist X", 0.70),  # duplicate of first
        _make_row("Song C", "Artist Z", 0.60),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 3
    titles = [r["song"].title for r in result]
    assert titles == ["Song A", "Song B", "Song C"]


def test_dedup_empty_input() -> None:
    assert _dedupe_by_normalized_title([]) == []


def test_dedup_no_duplicates_unchanged() -> None:
    """With no duplicate normalised keys the list passes through unmodified."""
    rows = [
        _make_row("Waterloo", "ABBA", 0.80),
        _make_row("Bohemian Rhapsody", "Queen", 0.75),
        _make_row("Stairway to Heaven", "Led Zeppelin", 0.70),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 3


def test_dedup_case_insensitive_artist() -> None:
    """Artist-name matching is case-insensitive."""
    rows = [
        _make_row("Africa", "Toto", 0.85),
        _make_row("Africa (Remastered)", "TOTO", 0.60),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 1
    assert result[0]["score"] == pytest.approx(0.85)


def test_dedup_feat_suffix_stripped() -> None:
    """feat. variants are collapsed into the base title."""
    rows = [
        _make_row("Shallow", "Lady Gaga", 0.92),
        _make_row("Shallow (feat. Bradley Cooper)", "Lady Gaga", 0.80),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 1


def test_dedup_year_tag_stripped() -> None:
    """Trailing year tags like ' - 2020' are stripped before grouping."""
    rows = [
        _make_row("Shape of You", "Ed Sheeran", 0.88),
        _make_row("Shape of You - 2020", "Ed Sheeran", 0.55),
    ]
    result = _dedupe_by_normalized_title(rows)
    assert len(result) == 1
    assert result[0]["score"] == pytest.approx(0.88)
