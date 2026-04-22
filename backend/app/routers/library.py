"""Per-user library endpoints: likes + playlists.

All routes require authentication. The Clerk session JWT identifies the
user; the backend owns the canonical library state so swapping browsers
/ signing out + back in shows the same data.
"""

from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.schemas.library import (
    LikeResponse,
    PlaylistCreate,
    PlaylistDetailResponse,
    PlaylistResponse,
    PlaylistSongAdd,
    PlaylistSongItem,
    PlaylistWithSongsResponse,
)
from app.schemas.song import SongResponse
from app.services.auth_service import get_current_user
from app.services import library_service
from app.services.song_service import record_interaction

router = APIRouter(prefix="/api/library", tags=["Library"])


# --- Likes ---

@router.get("/likes", response_model=List[LikeResponse])
async def get_likes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    likes = await library_service.list_likes(db, current_user.id)
    return [
        LikeResponse(
            id=l.id,
            song_id=l.song_id,
            created_at=l.created_at,
            song=SongResponse.model_validate(l.song) if l.song else None,
        )
        for l in likes
    ]


@router.post("/likes/{song_id}", response_model=LikeResponse)
async def like_song(
    song_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await library_service.song_exists(db, song_id):
        raise HTTPException(status_code=404, detail="Song not found")

    from app.services.cache import cache  # local import avoids startup cycle

    like, created = await library_service.like_song(
        db, current_user.id, song_id
    )
    # Taste model reads `interactions`; mirror heart likes into that stream once.
    if created:
        await record_interaction(db, current_user.id, song_id, "like")

    await cache.delete_pattern(f"mb:reco:foryou:{current_user.id}:*")
    await cache.delete_pattern(f"mb:reco:mood:*:u:{current_user.id}")
    await cache.delete(f"mb:taste:{current_user.id}")
    # Re-fetch with song eager-loaded for the response payload.
    likes = await library_service.list_likes(db, current_user.id)
    match = next((l for l in likes if l.id == like.id), like)
    return LikeResponse(
        id=match.id,
        song_id=match.song_id,
        created_at=match.created_at,
        song=SongResponse.model_validate(match.song) if match.song else None,
    )


@router.delete("/likes/{song_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlike_song(
    song_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await library_service.unlike_song(db, current_user.id, song_id)
    from app.services.cache import cache
    await cache.delete_pattern(f"mb:reco:foryou:{current_user.id}:*")
    await cache.delete_pattern(f"mb:reco:mood:*:u:{current_user.id}")
    await cache.delete(f"mb:taste:{current_user.id}")
    return None


# --- Playlists ---

@router.get("/playlists", response_model=List[PlaylistWithSongsResponse])
async def get_playlists(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlists = await library_service.list_playlists_with_songs(db, current_user.id)
    return [
        PlaylistWithSongsResponse(
            id=p.id,
            name=p.name,
            created_at=p.created_at,
            song_count=len(p.items),
            songs=[
                SongResponse.model_validate(it.song)
                for it in sorted(p.items, key=lambda x: x.position)
                if it.song
            ],
        )
        for p in playlists
    ]


@router.post("/playlists", response_model=PlaylistResponse)
async def create_playlist(
    payload: PlaylistCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = await library_service.create_playlist(
        db, current_user.id, payload.name
    )
    return PlaylistResponse(
        id=playlist.id,
        name=playlist.name,
        created_at=playlist.created_at,
        song_count=0,
    )


@router.get("/playlists/{playlist_id}", response_model=PlaylistDetailResponse)
async def get_playlist(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    playlist = await library_service.get_playlist(
        db, current_user.id, playlist_id
    )
    if playlist is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return PlaylistDetailResponse(
        id=playlist.id,
        name=playlist.name,
        created_at=playlist.created_at,
        items=[
            PlaylistSongItem(
                song_id=it.song_id,
                position=it.position,
                added_at=it.added_at,
                song=SongResponse.model_validate(it.song) if it.song else None,
            )
            for it in playlist.items
        ],
    )


@router.delete(
    "/playlists/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_playlist(
    playlist_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await library_service.delete_playlist(
        db, current_user.id, playlist_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return None


@router.post("/playlists/{playlist_id}/songs", response_model=PlaylistSongItem)
async def add_song_to_playlist(
    playlist_id: uuid.UUID,
    payload: PlaylistSongAdd,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await library_service.song_exists(db, payload.song_id):
        raise HTTPException(status_code=404, detail="Song not found")

    item, _created = await library_service.add_song_to_playlist(
        db, current_user.id, playlist_id, payload.song_id
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return PlaylistSongItem(
        song_id=item.song_id,
        position=item.position,
        added_at=item.added_at,
        song=None,
    )


@router.delete(
    "/playlists/{playlist_id}/songs/{song_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_song_from_playlist(
    playlist_id: uuid.UUID,
    song_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await library_service.remove_song_from_playlist(
        db, current_user.id, playlist_id, song_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Playlist or song not found")
    return None
