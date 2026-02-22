from pydantic import BaseModel
from typing import Optional, List


class AchievementResponse(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    xp_reward: int
    category: str
    unlocked: bool = False
    unlocked_at: Optional[str] = None

    class Config:
        from_attributes = True


class UserStatsResponse(BaseModel):
    xp_points: int
    current_streak: int
    longest_streak: int
    level: int
    xp_to_next_level: int
    achievements_unlocked: int
    total_achievements: int


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    xp_points: int
    streak: int


class XPGainResponse(BaseModel):
    xp_gained: int
    total_xp: int
    reason: str
    new_level: Optional[int] = None
    achievements_unlocked: List[AchievementResponse] = []
