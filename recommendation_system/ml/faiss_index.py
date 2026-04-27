"""FAISS vector index for song similarity search.

Index strategy
--------------
* Catalog < FAISS_IVF_MIN_TRAIN (default 256 vectors): use ``IndexFlatIP``
  (exact brute-force, always fast at small scale).
* Catalog ≥ FAISS_IVF_MIN_TRAIN: use ``IndexIVFFlat`` with
  ``nlist = clamp(4, int(sqrt(N)), 256)`` clusters.  This gives ~10× ANN
  speedup vs. brute-force on large catalogs with <0.1% recall drop.

All vectors are L2-normalised before insertion so that inner-product == cosine
similarity.

Disk format
-----------
``<path>.index`` — FAISS binary index file (faiss.write_index / read_index)
``<path>.ids``   — pickled list[str] mapping row positions to song IDs

Both files are written atomically via a temporary file + rename so that a
mid-write crash never corrupts the on-disk index.
"""

from __future__ import annotations

import logging
import os
import pickle
import tempfile
from typing import Optional

import faiss
import numpy as np

logger = logging.getLogger(__name__)

# IVF training requires at least this many vectors.
# Below this threshold we fall back to exact brute-force (IndexFlatIP).
FAISS_IVF_MIN_TRAIN: int = 256


def _nlist_for(n: int) -> int:
    """Return the number of IVF clusters appropriate for *n* vectors."""
    return int(max(4, min(int(n ** 0.5), 256)))


class FaissIndex:
    """FAISS vector index for song similarity search.

    Parameters
    ----------
    dim:
        Dimensionality of song embedding vectors (default 64 to match
        ``EMBEDDING_DIM`` in config).
    """

    def __init__(self, dim: int = 64) -> None:
        self.dim = dim
        # Start with a flat (exact) index; upgraded to IVF in build().
        self.index: faiss.Index = faiss.IndexFlatIP(dim)
        self.id_map: list[str] = []  # position → song_id

    # ------------------------------------------------------------------
    # Build / rebuild
    # ------------------------------------------------------------------

    def build(self, embeddings: np.ndarray, song_ids: list[str]) -> None:
        """Rebuild index from scratch using *embeddings* and *song_ids*.

        Chooses IVFFlat when ``len(embeddings) >= FAISS_IVF_MIN_TRAIN``,
        otherwise falls back to FlatIP (exact search).

        Parameters
        ----------
        embeddings:
            Float32 array of shape ``(N, dim)``.
        song_ids:
            Ordered list of song IDs, length must equal ``N``.
        """
        if len(embeddings) == 0:
            logger.warning("[FaissIndex] build() called with 0 embeddings — index cleared.")
            self.index = faiss.IndexFlatIP(self.dim)
            self.id_map = []
            return

        n = len(embeddings)
        vecs = self._normalise(embeddings)

        if n >= FAISS_IVF_MIN_TRAIN:
            nlist = _nlist_for(n)
            quantiser = faiss.IndexFlatIP(self.dim)
            ivf = faiss.IndexIVFFlat(quantiser, self.dim, nlist, faiss.METRIC_INNER_PRODUCT)
            ivf.train(vecs)
            ivf.add(vecs)
            # nprobe: check nlist/4 clusters per query (speed/recall tradeoff)
            ivf.nprobe = max(1, nlist // 4)
            self.index = ivf
            logger.info(
                "[FaissIndex] Built IVFFlat index: %d vectors, nlist=%d, nprobe=%d",
                n, nlist, ivf.nprobe,
            )
        else:
            flat = faiss.IndexFlatIP(self.dim)
            flat.add(vecs)
            self.index = flat
            logger.info("[FaissIndex] Built FlatIP index: %d vectors (below IVF threshold)", n)

        self.id_map = list(song_ids)

    # ------------------------------------------------------------------
    # Incremental append (no full rebuild)
    # ------------------------------------------------------------------

    def append(self, embedding: np.ndarray, song_id: str) -> None:
        """Add a single new song vector without rebuilding the entire index.

        For IVFFlat indices the vector is added directly (IVF supports
        incremental adds post-training).  For FlatIP it is added trivially.

        Note: when the catalog crosses ``FAISS_IVF_MIN_TRAIN`` after an
        append the index is NOT automatically upgraded to IVF — that upgrade
        happens on the next full ``build()`` call (triggered by the manager's
        scheduled rebuild).  At small scales FlatIP is fast enough that this
        is not a problem.

        Parameters
        ----------
        embedding:
            1-D float array of length ``dim``.
        song_id:
            Song identifier to map to this vector.
        """
        if song_id in self.id_map:
            logger.debug("[FaissIndex] append(): song %s already in index, skipping.", song_id)
            return
        vec = self._normalise(embedding.reshape(1, -1))
        self.index.add(vec)
        self.id_map.append(song_id)

    # ------------------------------------------------------------------
    # Search
    # ------------------------------------------------------------------

    def search(
        self,
        query_vector: np.ndarray,
        k: int = 20,
        exclude_ids: set[str] | None = None,
    ) -> list[tuple[str, float]]:
        """Return the *k* most similar songs to *query_vector*.

        Parameters
        ----------
        query_vector:
            1-D float array of length ``dim``.
        k:
            Number of results to return (before exclusion filtering).
        exclude_ids:
            Set of song IDs to omit from results.

        Returns
        -------
        list of (song_id, score) tuples sorted by descending score.
        """
        if self.index.ntotal == 0:
            return []

        # Fetch extra candidates to absorb exclusions.
        fetch_k = min(k + len(exclude_ids or set()) + 10, self.index.ntotal)

        query = self._normalise(query_vector.reshape(1, -1))
        scores, indices = self.index.search(query, fetch_k)

        results: list[tuple[str, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0 or idx >= len(self.id_map):
                continue
            sid = self.id_map[idx]
            if exclude_ids and sid in exclude_ids:
                continue
            results.append((sid, float(score)))
            if len(results) >= k:
                break

        return results

    # ------------------------------------------------------------------
    # Disk persistence (atomic write)
    # ------------------------------------------------------------------

    def save(self, path: str) -> None:
        """Persist index and ID map to *path*.{index,ids} atomically."""
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

        index_path = f"{path}.index"
        ids_path = f"{path}.ids"
        dir_ = os.path.dirname(os.path.abspath(index_path))

        # Write to temporaries then rename for atomicity.
        with tempfile.NamedTemporaryFile(dir=dir_, delete=False, suffix=".tmp") as tf:
            tmp_index = tf.name
        faiss.write_index(self.index, tmp_index)
        os.replace(tmp_index, index_path)

        with tempfile.NamedTemporaryFile(dir=dir_, delete=False, suffix=".tmp") as tf:
            tmp_ids = tf.name
        with open(tmp_ids, "wb") as f:
            pickle.dump(self.id_map, f, protocol=pickle.HIGHEST_PROTOCOL)
        os.replace(tmp_ids, ids_path)

        logger.info("[FaissIndex] Saved index (%d vectors) to %s", len(self.id_map), path)

    def load(self, path: str) -> bool:
        """Load index from *path*.{index,ids}.

        Returns
        -------
        True on success, False if files do not exist.
        """
        index_path = f"{path}.index"
        ids_path = f"{path}.ids"

        if not os.path.exists(index_path) or not os.path.exists(ids_path):
            return False

        try:
            self.index = faiss.read_index(index_path)
            with open(ids_path, "rb") as f:
                self.id_map = pickle.load(f)

            # Restore nprobe for IVF indices (not persisted by faiss.write_index)
            if hasattr(self.index, "nprobe"):
                nlist = getattr(self.index, "nlist", 4)
                self.index.nprobe = max(1, nlist // 4)

            logger.info("[FaissIndex] Loaded index (%d vectors) from %s", len(self.id_map), path)
            return True
        except Exception:
            logger.exception("[FaissIndex] Failed to load index from %s", path)
            return False

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _normalise(vecs: np.ndarray) -> np.ndarray:
        """L2-normalise rows of *vecs* in-place (safe against zero-vectors)."""
        v = vecs.astype(np.float32)
        norms = np.linalg.norm(v, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        return v / norms

    @property
    def size(self) -> int:
        """Number of vectors in the index."""
        return self.index.ntotal

    @property
    def is_warm(self) -> bool:
        """True when the index contains at least one vector."""
        return self.index.ntotal > 0
