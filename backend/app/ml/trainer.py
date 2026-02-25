"""
Training script for the Hybrid Recommender model.

Uses BPR (Bayesian Personalized Ranking) loss with implicit feedback.
Evaluates with Recall@K and NDCG@K.
"""
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import Optional

from app.ml.hybrid_model import HybridRecommender


def bpr_loss(pos_scores: torch.Tensor, neg_scores: torch.Tensor) -> torch.Tensor:
    """Bayesian Personalized Ranking loss."""
    return -torch.mean(torch.log(torch.sigmoid(pos_scores - neg_scores) + 1e-8))


def recall_at_k(predictions: list[str], ground_truth: set[str], k: int) -> float:
    """Compute Recall@K."""
    top_k = predictions[:k]
    hits = len(set(top_k) & ground_truth)
    return hits / min(len(ground_truth), k) if ground_truth else 0.0


def ndcg_at_k(predictions: list[str], ground_truth: set[str], k: int) -> float:
    """Compute NDCG@K."""
    dcg = 0.0
    for i, pred in enumerate(predictions[:k]):
        if pred in ground_truth:
            dcg += 1.0 / np.log2(i + 2)

    ideal_dcg = sum(1.0 / np.log2(i + 2) for i in range(min(len(ground_truth), k)))
    return dcg / ideal_dcg if ideal_dcg > 0 else 0.0


class Trainer:
    """Train the hybrid recommender model."""

    def __init__(
        self,
        model: HybridRecommender,
        lr: float = 0.001,
        weight_decay: float = 1e-5,
    ):
        self.model = model
        self.optimizer = optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
        self.scheduler = optim.lr_scheduler.StepLR(self.optimizer, step_size=10, gamma=0.5)

    def train_epoch(
        self,
        mood_indices: torch.Tensor,
        song_features: torch.Tensor,
        user_sequences: torch.Tensor,
        popularity: torch.Tensor,
        freshness: torch.Tensor,
        pos_mask: torch.Tensor,
    ) -> float:
        """Train one epoch with BPR loss."""
        self.model.train()
        self.optimizer.zero_grad()

        scores = self.model(
            mood_indices, song_features, user_sequences, popularity, freshness
        )

        # BPR: sample positive and negative pairs
        pos_scores = scores[pos_mask == 1]
        neg_scores = scores[pos_mask == 0]

        if len(pos_scores) == 0 or len(neg_scores) == 0:
            return 0.0

        # Random sampling for BPR pairs
        n_pairs = min(len(pos_scores), len(neg_scores))
        perm_pos = torch.randperm(len(pos_scores))[:n_pairs]
        perm_neg = torch.randperm(len(neg_scores))[:n_pairs]

        loss = bpr_loss(pos_scores[perm_pos], neg_scores[perm_neg])
        loss.backward()
        self.optimizer.step()

        return loss.item()

    def save_checkpoint(self, path: str):
        """Save model checkpoint."""
        torch.save({
            "model_state_dict": self.model.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
        }, path)

    def load_checkpoint(self, path: str):
        """Load model checkpoint."""
        checkpoint = torch.load(path, map_location="cpu")
        self.model.load_state_dict(checkpoint["model_state_dict"])
        self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
