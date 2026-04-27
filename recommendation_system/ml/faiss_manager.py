"""Singleton FAISS manager for the MoodBeats recommendation service.

Responsibilities
----------------
* **Warm-start**: on service startup, load the persisted index from disk; if
  the disk image is absent or stale (fewer vectors than the DB), rebuild from
  the DB and save.
* **Incremental updates**: after each new song is ingested, ``append()`` adds
  the song's embedding to the live index and saves to disk.
* **Thread-safe queries**: concurrent async reads are always allowed; a
  ``asyncio.Lock`` serialises index rebuilds so the live index is never seen
  in a half-built state.
* **Graceful degradation**: if FAISS is disabled via config or the catalog is
  below ``FAISS_MIN_CATALOG_SIZE``, ``query()`` returns an empty list and the
  caller falls back to the O(N) Python scorer.

Embedding derivation
--------------------
A song's 64-D embedding is constructed from the same audio features used by
the v1 scoring formula (valence, energy, danceability, tempo_norm,
acousticness) plus popularity and freshness, zero-padded to DIM.  This keeps
the FAISS candidate set semantically aligned with the final re-ranker.

The v2 path (arousal, intensity) will extend this vector once v2 scoring is
fully activated — no schema change needed; ``build()`` is called on each warm
and will pick up new columns automatically.
"""

from __future__ import annotations

import asyncio
import logging
import math
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from recommendation_system.ml.faiss_index import FaissIndex

if TYPE_CHECKING:
    pass  # avoid circular import; ORM model imported locally inside methods

logger = logging.getLogger(__name__)


def _song_to_embedding(song) -> np.ndarray:
    """Convert a Song ORM row to a 64-D float32 embedding.

    The vector layout mirrors the MOOD_PROFILES feature space so that cosine
    similarity in FAISS is semantically equivalent to the v1 mood scorer.

    Dimensions 0-4   : valence, energy, danceability, tempo_norm, acousticness
    Dimension  5     : log-normalized popularity (0-1)
    Dimension  6     : freshness (exp-decay, 0-1)
    Dimensions 7-63  : zero-padded (reserved for v2 features)
    """
    tempo_norm = min(1.0, float(getattr(song, "tempo", 100.0)) / 200.0)
    acousticness = float(getattr(song, "acousticness", 0.5))
    popularity = float(getattr(song, "popularity", 50)) / 100.0

    release_date = getattr(song, "release_date", None)
    if release_date:
        days_old = (datetime.utcnow() - release_date).days
        freshness = max(0.0, float(np.exp(-days_old / 730.0)))
    else:
        freshness = 0.5

    vec = np.zeros(64, dtype=np.float32)
    vec[0] = float(song.valence)
    vec[1] = float(song.energy)
    vec[2] = float(getattr(song, "danceability", 0.5))
    vec[3] = tempo_norm
    vec[4] = acousticness
    vec[5] = popularity
    vec[6] = freshness
    return vec


class FaissManager:
    """Process-level singleton owning the FaissIndex and its rebuild lifecycle.

    Usage
    -----
    Import the module-level ``faiss_manager`` singleton; do not instantiate
    ``FaissManager`` directly.

    ::

        from recommendation_system.ml.faiss_manager import faiss_manager

        # service startup
        await faiss_manager.warm(db)

        # query (returns empty list when cold/disabled)
        candidates = await faiss_manager.query(query_vec, k=60, exclude_ids=set())

        # after new song ingested
        await faiss_manager.append(song_id, embedding)
    """

    def __init__(self) -> None:
        self._index: FaissIndex | None = None
        self._lock = asyncio.Lock()
        self._settings = None  # loaded lazily
        self._enabled: bool = True
        self._index_path: str = "/var/moodbeats/faiss/songs"
        self._min_catalog: int = 50
        self._dim: int = 64

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_settings(self):
        if self._settings is None:
            try:
                from recommendation_system.config import get_reco_settings
                s = get_reco_settings()
            except ImportError:
                from app.config import get_settings
                s = get_settings()
            self._settings = s
            self._enabled = getattr(s, "FAISS_ENABLED", True)
            self._index_path = getattr(s, "FAISS_INDEX_PATH", "/var/moodbeats/faiss/songs")
            self._min_catalog = getattr(s, "FAISS_MIN_CATALOG_SIZE", 50)
            self._dim = getattr(s, "EMBEDDING_DIM", 64)
        return self._settings

    def _ensure_index(self) -> FaissIndex:
        if self._index is None:
            self._index = FaissIndex(dim=self._dim)
        return self._index

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def warm(self, db: AsyncSession) -> None:
        """Warm the index from disk or rebuild from DB.

        Called once at service startup inside ``lifespan()``.  Subsequent
        calls are safe (guarded by the lock) but are no-ops if the index is
        already warm and the disk image is fresh.

        Parameters
        ----------
        db:
            Async SQLAlchemy session used to load song rows when a full
            rebuild is required.
        """
        self._get_settings()
        if not self._enabled:
            logger.info("[FaissManager] FAISS disabled via config — skipping warm.")
            return

        async with self._lock:
            idx = self._ensure_index()

            # Try disk first
            if idx.load(self._index_path):
                db_count = await self._db_song_count(db)
                if idx.size >= db_count * 0.9:  # within 10% of DB — consider fresh
                    logger.info(
                        "[FaissManager] Index loaded from disk: %d vectors (DB: %d songs)",
                        idx.size, db_count,
                    )
                    return
                logger.info(
                    "[FaissManager] Disk index stale (%d vectors, DB has %d songs) — rebuilding.",
                    idx.size, db_count,
                )

            # Full rebuild from DB
            await self._rebuild(db, idx)

    async def append(self, song_id: str | uuid.UUID, embedding: np.ndarray) -> None:
        """Incrementally add one song to the live index and save to disk.

        Safe to call from the ingestion worker immediately after a new song
        is inserted into Postgres.

        Parameters
        ----------
        song_id:
            The new song's UUID (str or uuid.UUID).
        embedding:
            Pre-computed 64-D float32 embedding for the song.
        """
        self._get_settings()
        if not self._enabled:
            return
        if self._index is None:
            return  # not warmed yet; full rebuild will pick it up on next start

        async with self._lock:
            self._index.append(embedding, str(song_id))
            self._index.save(self._index_path)
            logger.debug("[FaissManager] Appended song %s; index size now %d", song_id, self._index.size)

    async def query(
        self,
        query_vec: np.ndarray,
        k: int = 20,
        exclude_ids: set[str] | None = None,
    ) -> list[tuple[str, float]]:
        """Return up to *k* candidate (song_id, score) pairs.

        Returns an empty list when:
        - FAISS is disabled
        - The index is not yet warmed
        - The catalog is below ``FAISS_MIN_CATALOG_SIZE``

        The caller (``recommendation_service``) falls back to the O(N) path
        when an empty list is returned.

        Parameters
        ----------
        query_vec:
            1-D float32 array of length ``dim``.
        k:
            Number of candidates to return.
        exclude_ids:
            Song IDs to omit from results.
        """
        self._get_settings()
        if not self._enabled:
            return []
        if self._index is None or not self._index.is_warm:
            return []
        if self._index.size < self._min_catalog:
            return []

        # Reads do NOT need the lock (FAISS index is read-safe concurrently)
        return self._index.search(query_vec, k=k, exclude_ids=exclude_ids)

    @property
    def is_warm(self) -> bool:
        """True when the index has been initialised and contains vectors."""
        return self._index is not None and self._index.is_warm

    @property
    def size(self) -> int:
        """Current number of indexed songs."""
        return self._index.size if self._index else 0

    # ------------------------------------------------------------------
    # Internal: DB helpers
    # ------------------------------------------------------------------

    async def _db_song_count(self, db: AsyncSession) -> int:
        from app.models.song import Song  # always in PYTHONPATH
        from sqlalchemy import func
        result = await db.execute(select(func.count()).select_from(Song))
        return result.scalar_one() or 0

    async def _rebuild(self, db: AsyncSession, idx: FaissIndex) -> None:
        """Load all songs from DB, compute embeddings, build index, save."""
        from app.models.song import Song  # always in PYTHONPATH

        result = await db.execute(select(Song))
        songs = result.scalars().all()

        if not songs:
            logger.warning("[FaissManager] No songs in DB — index remains empty.")
            return

        embeddings = np.stack([_song_to_embedding(s) for s in songs]).astype(np.float32)
        song_ids = [str(s.id) for s in songs]

        idx.build(embeddings, song_ids)
        idx.save(self._index_path)
        logger.info("[FaissManager] Rebuilt index from DB: %d songs → saved to %s", len(songs), self._index_path)


# ---------------------------------------------------------------------------
# Module-level singleton — import this in all call sites.
# ---------------------------------------------------------------------------
faiss_manager = FaissManager()
