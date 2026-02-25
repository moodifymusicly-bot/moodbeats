import numpy as np
import faiss
from typing import Optional
import os
import pickle


class FaissIndex:
    """FAISS vector index for song similarity search."""

    def __init__(self, dim: int = 64):
        self.dim = dim
        self.index = faiss.IndexFlatIP(dim)  # Inner product (cosine after normalize)
        self.id_map: list[str] = []  # Song ID mapping

    def build(self, embeddings: np.ndarray, song_ids: list[str]):
        """Build index from song embeddings."""
        # Normalize for cosine similarity
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1
        normalized = embeddings / norms

        self.index = faiss.IndexFlatIP(self.dim)
        self.index.add(normalized.astype(np.float32))
        self.id_map = song_ids

    def search(self, query_vector: np.ndarray, k: int = 20) -> list[tuple[str, float]]:
        """Search for k most similar songs."""
        # Normalize query
        norm = np.linalg.norm(query_vector)
        if norm > 0:
            query_vector = query_vector / norm

        query = query_vector.reshape(1, -1).astype(np.float32)
        scores, indices = self.index.search(query, min(k, self.index.ntotal))

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= 0 and idx < len(self.id_map):
                results.append((self.id_map[idx], float(score)))
        return results

    def save(self, path: str):
        """Save index to disk."""
        os.makedirs(os.path.dirname(path), exist_ok=True)
        faiss.write_index(self.index, f"{path}.index")
        with open(f"{path}.ids", "wb") as f:
            pickle.dump(self.id_map, f)

    def load(self, path: str) -> bool:
        """Load index from disk."""
        try:
            self.index = faiss.read_index(f"{path}.index")
            with open(f"{path}.ids", "rb") as f:
                self.id_map = pickle.load(f)
            return True
        except FileNotFoundError:
            return False

    @property
    def size(self) -> int:
        return self.index.ntotal
