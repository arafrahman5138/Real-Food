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
    level_title: str = ""
    xp_to_next_level: int
    achievements_unlocked: int
    total_achievements: int
    nutrition_streak: int = 0
    nutrition_longest_streak: int = 0


class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    xp_points: int
    streak: int
    level: int = 1
    level_title: str = ""


class XPGainResponse(BaseModel):
    xp_gained: int
    total_xp: int
    reason: str
    new_level: Optional[int] = None
    level_title: Optional[str] = None
    achievements_unlocked: List[AchievementResponse] = []


class DailyQuestResponse(BaseModel):
    id: str
    quest_type: str
    title: str
    description: str
    target_value: float
    current_value: float
    xp_reward: int
    completed: bool


class NutritionStreakResponse(BaseModel):
    current_streak: int
    longest_streak: int
    threshold: float = 60.0
    last_qualifying_date: Optional[str] = None


class ScoreHistoryEntry(BaseModel):
    date: str
    score: float
    tier: str  # none / bronze / silver / gold
