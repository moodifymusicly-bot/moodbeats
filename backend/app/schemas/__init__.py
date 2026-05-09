from app.schemas.user import UserResponse
from app.schemas.song import SongResponse, SongListResponse

# RecommendationRequest, RecommendationResponse moved to recommendation_system.schemas.recommendation
# TODO: replace with API call to recommendation_system
# from recommendation_system.schemas.recommendation import RecommendationRequest, RecommendationResponse

__all__ = [
    "UserResponse",
    "SongResponse", "SongListResponse",
    # "RecommendationRequest", "RecommendationResponse",  # now in recommendation_system
]
