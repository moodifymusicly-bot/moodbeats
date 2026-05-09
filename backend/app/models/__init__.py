from app.models.user import User
from app.models.song import Song
from app.models.interaction import Interaction, MoodHistory
from app.models.library import Like, Playlist, PlaylistSong
from app.models.search_history import SearchHistory  # Phase 5 — recently searched

__all__ = [
    "User",
    "Song",
    "Interaction",
    "MoodHistory",
    "Like",
    "Playlist",
    "PlaylistSong",
    "SearchHistory",  # Phase 5 — recently searched
]
