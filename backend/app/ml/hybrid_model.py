import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


class MoodEmbedding(nn.Module):
    """Learnable mood embeddings."""

    def __init__(self, num_moods: int = 6, embed_dim: int = 64):
        super().__init__()
        self.embedding = nn.Embedding(num_moods, embed_dim)

    def forward(self, mood_idx: torch.Tensor) -> torch.Tensor:
        return self.embedding(mood_idx)


class SongEncoder(nn.Module):
    """Encode song audio features into embedding space."""

    def __init__(self, input_dim: int = 6, embed_dim: int = 64):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, embed_dim),
        )
        self.norm = nn.LayerNorm(embed_dim)

    def forward(self, features: torch.Tensor) -> torch.Tensor:
        return self.norm(self.encoder(features))


class UserEncoder(nn.Module):
    """Transformer-based user encoder from interaction sequence."""

    def __init__(self, song_embed_dim: int = 64, nhead: int = 4, num_layers: int = 2):
        super().__init__()
        self.pos_embedding = nn.Embedding(100, song_embed_dim)
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=song_embed_dim,
            nhead=nhead,
            dim_feedforward=128,
            dropout=0.1,
            batch_first=True,
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        self.output_proj = nn.Linear(song_embed_dim, song_embed_dim)

    def forward(self, song_seq: torch.Tensor) -> torch.Tensor:
        """
        song_seq: (batch, seq_len, embed_dim) - sequence of song embeddings
        Returns: (batch, embed_dim) - user representation
        """
        batch_size, seq_len, _ = song_seq.shape
        positions = torch.arange(seq_len, device=song_seq.device).unsqueeze(0).expand(batch_size, -1)
        x = song_seq + self.pos_embedding(positions)
        x = self.transformer(x)
        # Mean pooling over sequence
        user_embed = x.mean(dim=1)
        return self.output_proj(user_embed)


class HybridRecommender(nn.Module):
    """
    Hybrid recommendation model combining:
    - Mood embeddings
    - Song content embeddings (audio features)
    - User sequence embeddings (Transformer)

    Final score = α * mood_match + β * user_song_sim + γ * popularity + δ * freshness
    """

    def __init__(
        self,
        num_moods: int = 6,
        song_feature_dim: int = 6,
        embed_dim: int = 64,
    ):
        super().__init__()
        self.embed_dim = embed_dim

        self.mood_embed = MoodEmbedding(num_moods, embed_dim)
        self.song_encoder = SongEncoder(song_feature_dim, embed_dim)
        self.user_encoder = UserEncoder(embed_dim)

        # Scoring weights (learnable)
        self.alpha = nn.Parameter(torch.tensor(0.4))
        self.beta = nn.Parameter(torch.tensor(0.25))
        self.gamma = nn.Parameter(torch.tensor(0.2))
        self.delta = nn.Parameter(torch.tensor(0.15))

        # Final scoring MLP
        self.scorer = nn.Sequential(
            nn.Linear(embed_dim * 3, 128),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(128, 64),
            nn.ReLU(),
            nn.Linear(64, 1),
            nn.Sigmoid(),
        )

    def forward(
        self,
        mood_idx: torch.Tensor,
        song_features: torch.Tensor,
        user_song_seq: torch.Tensor,
        popularity: torch.Tensor,
        freshness: torch.Tensor,
    ) -> torch.Tensor:
        """
        mood_idx: (batch,) mood indices
        song_features: (batch, 6) audio features
        user_song_seq: (batch, seq_len, embed_dim) user interaction history
        popularity: (batch,) normalized popularity
        freshness: (batch,) freshness score
        """
        mood_emb = self.mood_embed(mood_idx)        # (batch, embed_dim)
        song_emb = self.song_encoder(song_features)  # (batch, embed_dim)
        user_emb = self.user_encoder(user_song_seq)   # (batch, embed_dim)

        # Concatenate all embeddings
        combined = torch.cat([mood_emb, song_emb, user_emb], dim=-1)

        # Neural score
        neural_score = self.scorer(combined).squeeze(-1)

        # Weighted combination with heuristics
        mood_match = F.cosine_similarity(mood_emb, song_emb, dim=-1)
        user_sim = F.cosine_similarity(user_emb, song_emb, dim=-1)

        final_score = (
            torch.sigmoid(self.alpha) * mood_match
            + torch.sigmoid(self.beta) * user_sim
            + torch.sigmoid(self.gamma) * popularity
            + torch.sigmoid(self.delta) * freshness
        ) * 0.5 + neural_score * 0.5

        return final_score

    def get_song_embeddings(self, song_features: torch.Tensor) -> np.ndarray:
        """Get song embeddings for FAISS indexing."""
        with torch.no_grad():
            embeddings = self.song_encoder(song_features)
            return embeddings.cpu().numpy()

    def get_mood_embedding(self, mood_idx: int) -> np.ndarray:
        """Get mood embedding vector."""
        with torch.no_grad():
            idx = torch.tensor([mood_idx])
            emb = self.mood_embed(idx)
            return emb.cpu().numpy()[0]
