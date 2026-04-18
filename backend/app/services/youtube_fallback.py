"""Curated YouTube video IDs used when the Data API is unavailable or errors.

Embeds use public YouTube watch IDs only. Mood lists power `/api/youtube/search`
when `YOUTUBE_API_KEY` is empty or Google returns an error, so playback still works.
"""

from __future__ import annotations

from itertools import chain

# Verified via youtube oembed (embeddable public videos).
_MOOD_POOLS: dict[str, list[tuple[str, str, str]]] = {
    "happy": [
        ("y6Sxv-sUYtM", "Pharrell Williams - Happy (Official Music Video)", "Pharrell Williams"),
        ("ZbZSe6N_BXs", "Pharrell Williams - Happy (Official Video)", "PharrellWilliamsVEVO"),
        ("09R8_2nJtjg", "Maroon 5 - Sugar (Official Music Video)", "Maroon5VEVO"),
        ("OPf0YbXqDm0", "Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars", "Mark Ronson"),
        ("e-ORhEE9VVg", "Taylor Swift - Blank Space", "Taylor Swift"),
        ("CevxZvSJLk8", "Katy Perry - Roar", "Katy Perry"),
        ("YQHsXMglC9A", "Adele - Hello (Official Music Video)", "Adele"),
        ("ktvTqknDobU", "Imagine Dragons - Radioactive", "Imagine Dragons"),
    ],
    "sad": [
        ("hLQl3WQQoQ0", "Adele - Someone Like You (Official Music Video)", "Adele"),
        ("XFkzRNyygfk", "Radiohead - Creep", "Radiohead"),
        ("RBumgq5yVrA", "Passenger | Let Her Go (Official Video)", "Passenger"),
        ("V1Pl8CzNzCw", "Billie Eilish, Khalid - lovely", "Billie Eilish"),
        ("YQHsXMglC9A", "Adele - Hello (Official Music Video)", "Adele"),
        ("60ItHLz5WEA", "Alan Walker - Faded", "Alan Walker"),
        ("nSDgHBxUbVQ", "Ed Sheeran - Photograph (Official Music Video)", "Ed Sheeran"),
        ("yKNxeF4KMsY", "Coldplay - Yellow (Official Video)", "Coldplay"),
    ],
    "gym": [
        ("PsO6ZnUZI0g", "Kanye West - Stronger", "Kanye West"),
        ("Obim8BYGnOE", "Eminem - Till I Collapse", "Eminem"),
        ("y6120QOlsfU", "Darude - Sandstorm", "Darude"),
        ("ktvTqknDobU", "Imagine Dragons - Radioactive", "Imagine Dragons"),
        ("CevxZvSJLk8", "Katy Perry - Roar", "Katy Perry"),
        ("60ItHLz5WEA", "Alan Walker - Faded", "Alan Walker"),
        ("OPf0YbXqDm0", "Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars", "Mark Ronson"),
        ("e-ORhEE9VVg", "Taylor Swift - Blank Space", "Taylor Swift"),
    ],
    "study": [
        ("jfKfPfyJRdk", "lofi hip hop radio 📚 beats to relax/study to", "Lofi Girl"),
        ("5qap5aO4i9A", "lofi hip hop radio - beats to relax/study to", "Lofi Girl"),
        ("60ItHLz5WEA", "Alan Walker - Faded", "Alan Walker"),
        ("yKNxeF4KMsY", "Coldplay - Yellow (Official Video)", "Coldplay"),
        ("RBumgq5yVrA", "Passenger | Let Her Go (Official Video)", "Passenger"),
        ("hLQl3WQQoQ0", "Adele - Someone Like You (Official Music Video)", "Adele"),
        ("nSDgHBxUbVQ", "Ed Sheeran - Photograph (Official Music Video)", "Ed Sheeran"),
        ("V1Pl8CzNzCw", "Billie Eilish, Khalid - lovely", "Billie Eilish"),
    ],
    "rock": [
        ("1w7OgIMMRc4", "Guns N' Roses - Sweet Child O' Mine (Official Music Video)", "Guns N' Roses"),
        ("fJ9rUzIMcZQ", "Queen – Bohemian Rhapsody (Official Video Remastered)", "Queen"),
        ("ktvTqknDobU", "Imagine Dragons - Radioactive", "Imagine Dragons"),
        ("CevxZvSJLk8", "Katy Perry - Roar", "Katy Perry"),
        ("OPf0YbXqDm0", "Mark Ronson - Uptown Funk (Official Video) ft. Bruno Mars", "Mark Ronson"),
        ("PsO6ZnUZI0g", "Kanye West - Stronger", "Kanye West"),
        ("y6120QOlsfU", "Darude - Sandstorm", "Darude"),
        ("e-ORhEE9VVg", "Taylor Swift - Blank Space", "Taylor Swift"),
    ],
}

_GENERIC_POOL: list[tuple[str, str, str]] = list(chain.from_iterable(_MOOD_POOLS.values()))


def _dedupe_preserve_order(items: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    seen: set[str] = set()
    out: list[tuple[str, str, str]] = []
    for vid, title, artist in items:
        if vid in seen:
            continue
        seen.add(vid)
        out.append((vid, title, artist))
    return out


def pick_fallback_items(query: str, limit: int) -> list[tuple[str, str, str, int]]:
    """Return (video_id, title, channel, duration_seconds) tuples.

    Duration is 0 when unknown; the client still plays via iframe.
    """
    q = (query or "").strip().lower()
    limit = max(1, min(limit, 25))

    pool: list[tuple[str, str, str]]
    if "happy" in q or "joy" in q:
        pool = _MOOD_POOLS["happy"]
    elif "sad" in q or "melanch" in q or "cry" in q:
        pool = _MOOD_POOLS["sad"]
    elif "gym" in q or "workout" in q or "lift" in q or "run" in q:
        pool = _MOOD_POOLS["gym"]
    elif "study" in q or "focus" in q or "chill" in q or "lofi" in q:
        pool = _MOOD_POOLS["study"]
    elif "rock" in q or "metal" in q or "guitar" in q:
        pool = _MOOD_POOLS["rock"]
    else:
        pool = _GENERIC_POOL

    merged = _dedupe_preserve_order(list(pool) + _GENERIC_POOL)
    picked = merged[:limit]
    return [(vid, title, artist, 0) for vid, title, artist in picked]
