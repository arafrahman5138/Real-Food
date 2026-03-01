from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.gamification import Achievement, UserAchievement, XPTransaction, NutritionStreak, DailyQuest
from app.models.saved_recipe import SavedRecipe
from app.models.nutrition import DailyNutritionSummary, NutritionTarget, FoodLog
from app.schemas.gamification import (
    AchievementResponse, UserStatsResponse, LeaderboardEntry, XPGainResponse,
    DailyQuestResponse, NutritionStreakResponse, ScoreHistoryEntry,
)
from app.achievements_engine import check_achievements, award_xp, update_nutrition_streak, level_title
from typing import List, Optional
from datetime import datetime, timedelta, date
import uuid
import random

router = APIRouter()

XP_PER_LEVEL = 1000


def calculate_level(xp: int) -> int:
    return (xp // XP_PER_LEVEL) + 1


def xp_to_next_level(xp: int) -> int:
    return XP_PER_LEVEL - (xp % XP_PER_LEVEL)


@router.get("/stats", response_model=UserStatsResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total_achievements = db.query(Achievement).count()
    unlocked = db.query(UserAchievement).filter(
        UserAchievement.user_id == current_user.id
    ).count()
    lvl = calculate_level(current_user.xp_points)

    ns = db.query(NutritionStreak).filter(NutritionStreak.user_id == current_user.id).first()

    return UserStatsResponse(
        xp_points=current_user.xp_points,
        current_streak=current_user.current_streak,
        longest_streak=current_user.longest_streak,
        level=lvl,
        level_title=level_title(lvl),
        xp_to_next_level=xp_to_next_level(current_user.xp_points),
        achievements_unlocked=unlocked,
        total_achievements=total_achievements,
        nutrition_streak=ns.current_streak if ns else 0,
        nutrition_longest_streak=ns.longest_streak if ns else 0,
    )


@router.get("/achievements", response_model=List[AchievementResponse])
async def get_achievements(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    achievements = db.query(Achievement).all()
    user_achievements = {
        str(ua.achievement_id): ua.unlocked_at
        for ua in db.query(UserAchievement).filter(
            UserAchievement.user_id == current_user.id
        ).all()
    }

    return [
        AchievementResponse(
            id=str(a.id),
            name=a.name,
            description=a.description,
            icon=a.icon,
            xp_reward=a.xp_reward,
            category=a.category,
            unlocked=str(a.id) in user_achievements,
            unlocked_at=user_achievements.get(str(a.id), {
            }).isoformat() if str(a.id) in user_achievements else None,
        )
        for a in achievements
    ]


@router.post("/xp", response_model=XPGainResponse)
async def award_xp_endpoint(
    amount: int,
    reason: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = award_xp(db, current_user, amount, reason)

    # Auto-check achievements after XP gain
    new_achievements = check_achievements(db, current_user)

    return XPGainResponse(
        xp_gained=result["xp_gained"],
        total_xp=result["total_xp"],
        reason=reason,
        new_level=result["new_level"],
        level_title=result.get("level_title"),
        achievements_unlocked=[
            AchievementResponse(
                id=a["id"], name=a["name"], description=a["description"],
                icon=a["icon"], xp_reward=a["xp_reward"], category=a["category"],
                unlocked=True,
            ) for a in new_achievements
        ],
    )


@router.get("/leaderboard", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    top_users = db.query(User).order_by(User.xp_points.desc()).limit(20).all()
    return [
        LeaderboardEntry(
            rank=i + 1,
            name=u.name,
            xp_points=u.xp_points,
            streak=u.current_streak,
            level=calculate_level(u.xp_points),
            level_title=level_title(calculate_level(u.xp_points)),
        )
        for i, u in enumerate(top_users)
    ]


@router.get("/weekly-stats")
async def get_weekly_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    week_ago = datetime.utcnow() - timedelta(days=7)
    xp_this_week = (
        db.query(XPTransaction)
        .filter(XPTransaction.user_id == current_user.id, XPTransaction.created_at >= week_ago)
        .all()
    )

    meals_cooked = sum(1 for t in xp_this_week if "cook" in (t.reason or "").lower() or "meal_log" in (t.reason or "").lower())
    recipes_saved = (
        db.query(SavedRecipe)
        .filter(SavedRecipe.user_id == current_user.id, SavedRecipe.saved_at >= week_ago)
        .count()
    )
    foods_explored = sum(1 for t in xp_this_week if "explore" in (t.reason or "").lower() or "browse" in (t.reason or "").lower())
    meals_logged = db.query(FoodLog).filter(
        FoodLog.user_id == current_user.id, FoodLog.created_at >= week_ago
    ).count()

    return {
        "meals_cooked": meals_cooked,
        "recipes_saved": recipes_saved,
        "foods_explored": foods_explored,
        "meals_logged": meals_logged,
        "xp_earned": sum(t.amount for t in xp_this_week),
    }


@router.post("/check-achievements")
async def trigger_achievement_check(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new = check_achievements(db, current_user)
    return {"newly_unlocked": new}


@router.post("/streak")
async def update_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    last_active = current_user.last_active_date.date() if current_user.last_active_date else None

    if last_active == today:
        return {"message": "Already logged today", "streak": current_user.current_streak}

    if last_active and (today - last_active).days == 1:
        current_user.current_streak += 1
    elif last_active and (today - last_active).days > 1:
        current_user.current_streak = 1
    else:
        current_user.current_streak = 1

    if current_user.current_streak > current_user.longest_streak:
        current_user.longest_streak = current_user.current_streak

    current_user.last_active_date = datetime.utcnow()
    db.commit()

    # Award daily streak XP (once per day)
    existing_streak_xp = db.query(XPTransaction).filter(
        XPTransaction.user_id == current_user.id,
        XPTransaction.reason == "daily_streak",
        XPTransaction.created_at >= datetime.combine(today, datetime.min.time()),
    ).first()
    if not existing_streak_xp:
        award_xp(db, current_user, 100, "daily_streak")

    # Check streak-related achievements
    check_achievements(db, current_user)

    return {"message": "Streak updated", "streak": current_user.current_streak}


# ═══════════════════════════════════
# Nutrition Streak
# ═══════════════════════════════════

@router.get("/nutrition-streak", response_model=NutritionStreakResponse)
async def get_nutrition_streak(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ns = db.query(NutritionStreak).filter(NutritionStreak.user_id == current_user.id).first()
    if not ns:
        return NutritionStreakResponse(current_streak=0, longest_streak=0, threshold=60.0)
    return NutritionStreakResponse(
        current_streak=ns.current_streak,
        longest_streak=ns.longest_streak,
        threshold=ns.threshold or 60.0,
        last_qualifying_date=ns.last_qualifying_date.isoformat() if ns.last_qualifying_date else None,
    )


# ═══════════════════════════════════
# Score History (30-day calendar data)
# ═══════════════════════════════════

@router.get("/score-history", response_model=List[ScoreHistoryEntry])
async def get_score_history(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start_date = datetime.utcnow().date() - timedelta(days=days)
    summaries = (
        db.query(DailyNutritionSummary)
        .filter(
            DailyNutritionSummary.user_id == current_user.id,
            DailyNutritionSummary.date >= start_date,
        )
        .order_by(DailyNutritionSummary.date.asc())
        .all()
    )
    return [
        ScoreHistoryEntry(
            date=s.date.isoformat(),
            score=round(s.daily_score or 0, 1),
            tier="gold" if (s.daily_score or 0) >= 90 else "silver" if (s.daily_score or 0) >= 75 else "bronze" if (s.daily_score or 0) >= 60 else "none",
        )
        for s in summaries
    ]


# ═══════════════════════════════════
# Daily Quests
# ═══════════════════════════════════

def _generate_quests(db: Session, user: User, today: date) -> list[DailyQuest]:
    """Generate 3 daily quests: 1 general, 1 logging, 1 quality."""
    targets = db.query(NutritionTarget).filter(NutritionTarget.user_id == user.id).first()
    protein_target = float(targets.protein_g_target) if targets else 130.0
    fiber_target = float(targets.fiber_g_target) if targets else 30.0

    general_pool = [
        ("Healthify a Craving", "Transform one comfort food into a whole-food version.", "healthify", 1, 40),
        ("Save a Recipe", "Save a new recipe to your collection.", "save_recipe", 1, 25),
        ("Explore a Cuisine", "Browse recipes from a new cuisine.", "explore_cuisine", 1, 30),
    ]

    logging_pool = [
        ("Log Breakfast", "Log your breakfast meal.", "log_breakfast", 1, 30),
        ("Log All 3 Meals", "Log breakfast, lunch, and dinner.", "log_3_meals", 3, 60),
        ("Log a Snack", "Log a healthy snack.", "log_snack", 1, 20),
    ]

    quality_pool = [
        (f"Hit {int(protein_target)}g Protein", f"Reach your daily protein target of {int(protein_target)}g.", "hit_protein", protein_target, 60),
        (f"Eat {int(fiber_target)}g Fiber", f"Reach your daily fiber target of {int(fiber_target)}g.", "hit_fiber", fiber_target, 50),
        ("Score Bronze+", "Achieve a daily nutrition score of 60 or higher.", "score_bronze", 60, 50),
        ("Score Silver+", "Achieve a daily nutrition score of 75 or higher.", "score_silver", 75, 80),
    ]

    random.seed(f"{user.id}-{today.isoformat()}")  # deterministic per user per day
    gen = random.choice(general_pool)
    log = random.choice(logging_pool)
    qual = random.choice(quality_pool)

    quests = []
    for quest_type, (title, desc, meta_key, target, xp) in [("general", gen), ("logging", log), ("quality", qual)]:
        q = DailyQuest(
            id=str(uuid.uuid4()),
            user_id=user.id,
            date=today,
            quest_type=quest_type,
            title=title,
            description=desc,
            target_value=float(target),
            current_value=0,
            xp_reward=xp,
            completed=False,
            metadata_json={"key": meta_key},
        )
        db.add(q)
        quests.append(q)

    db.commit()
    return quests


@router.get("/daily-quests", response_model=List[DailyQuestResponse])
async def get_daily_quests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = datetime.utcnow().date()
    quests = (
        db.query(DailyQuest)
        .filter(DailyQuest.user_id == current_user.id, DailyQuest.date == today)
        .all()
    )

    if not quests:
        quests = _generate_quests(db, current_user, today)

    return [
        DailyQuestResponse(
            id=str(q.id),
            quest_type=q.quest_type,
            title=q.title,
            description=q.description,
            target_value=q.target_value,
            current_value=q.current_value,
            xp_reward=q.xp_reward,
            completed=q.completed,
        )
        for q in quests
    ]


@router.post("/daily-quests/{quest_id}/progress")
async def update_quest_progress(
    quest_id: str,
    amount: float = 1.0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    quest = db.query(DailyQuest).filter(
        DailyQuest.id == quest_id,
        DailyQuest.user_id == current_user.id,
    ).first()
    if not quest:
        return {"error": "Quest not found"}
    if quest.completed:
        return {"message": "Already completed", "xp_gained": 0}

    quest.current_value = min(quest.target_value, (quest.current_value or 0) + amount)
    xp_gained = 0
    if quest.current_value >= quest.target_value:
        quest.completed = True
        quest.completed_at = datetime.utcnow()
        xp_result = award_xp(db, current_user, quest.xp_reward, f"quest:{quest.title}")
        xp_gained = quest.xp_reward
    db.commit()

    return {
        "quest_id": quest_id,
        "current_value": quest.current_value,
        "completed": quest.completed,
        "xp_gained": xp_gained,
    }
