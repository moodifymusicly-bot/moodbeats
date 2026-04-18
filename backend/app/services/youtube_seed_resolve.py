"""Map seed-catalog (title, artist) pairs to known YouTube video IDs.

Keys use `_key(title, artist)` so they align with `backend/app/seed/seed_data.py`.
"""

from __future__ import annotations

import re

def _norm(x: str) -> str:
    x = x.lower().strip()
    x = re.sub(r"[^a-z0-9]+", " ", x)
    return re.sub(r"\s+", " ", x).strip()


def _key(title: str, artist: str) -> str:
    return f"{_norm(title)}|{_norm(artist)}"


def _entries() -> dict[str, str]:
    return {
        _key("Happy", "Pharrell Williams"): "y6Sxv-sUYtM",
        _key("Sugar", "Maroon 5"): "09R8_2nJtjg",
        _key("Uptown Funk", "Bruno Mars ft. Mark Ronson"): "OPf0YbXqDm0",
        _key("Dynamite", "BTS"): "gdZLi9oWNZg",
        _key("Levitating", "Dua Lipa"): "TUVcZfQe-Kw",
        _key("Blinding Lights", "The Weeknd"): "4NRXx6U8ABQ",
        _key("Sunflower", "Post Malone & Swae Lee"): "ApXoWvfEYVU",
        _key("Someone Like You", "Adele"): "hLQl3WQQoQ0",
        _key("Creep", "Radiohead"): "XFkzRNyygfk",
        _key("Let Her Go", "Passenger"): "RBumgq5yVrA",
        _key("Photograph", "Ed Sheeran"): "nSDgHBxUbVQ",
        _key("Stronger", "Kanye West"): "PsO6ZnUZI0g",
        _key("Till I Collapse", "Eminem"): "Obim8BYGnOE",
        _key("Radioactive", "Imagine Dragons"): "ktvTqknDobU",
        _key("Faded", "Alan Walker"): "60ItHLz5WEA",
        _key("Weightless", "Marconi Union"): "UfcAVejslrU",
        _key("Sweet Child O' Mine", "Guns N' Roses"): "1w7OgIMMRc4",
        _key("Bohemian Rhapsody", "Queen"): "fJ9rUzIMcZQ",
    }


_SEED_YOUTUBE_IDS = _entries()


def resolve_seed_youtube_id(title: str, artist: str) -> str | None:
    """Return a known video id for this seed track, if present."""
    return _SEED_YOUTUBE_IDS.get(_key(title, artist))
