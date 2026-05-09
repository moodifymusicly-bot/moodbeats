import torch
import torch.nn as nn
import numpy as np
from recommendation_system.ml.hybrid_model import HybridRecommender


def get_song_feature_vector(song) -> list[float]:
    """Extract audio feature vector from a song model."""
    return [
        song.valence,
        song.energy,
        song.danceability,
        song.tempo / 200.0,  # normalize tempo
        song.acousticness,
        song.instrumentalness,
    ]


def compute_song_embeddings(model: HybridRecommender, songs: list) -> np.ndarray:
    """Compute embeddings for a list of songs."""
    features = [get_song_feature_vector(s) for s in songs]
    features_tensor = torch.tensor(features, dtype=torch.float32)
    return model.get_song_embeddings(features_tensor)
