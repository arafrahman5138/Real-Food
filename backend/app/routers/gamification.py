from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.gamification import Achievement, UserAchievement, XPTransaction
from app.models.saved_recipe import SavedRecipe
from app.schemas.gamification import AchievementResponse, UserStatsResponse, LeaderboardEntry, XPGainResponse
from app.achievements_engine import check_achievements
from typing import List
from datetime import datetime, timedelta

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

    return UserStatsResponse(
        xp_points=current_user.xp_points,
        current_streak=current_user.current_streak,
        longest_streak=current_user.longest_streak,
        level=calculate_level(current_user.xp_points),
        xp_to_next_level=xp_to_next_level(current_user.xp_points),
        achievements_unlocked=unlocked,
        total_achievements=total_achievements,
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
async def award_xp(
    amount: int,
    reason: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    old_level = calculate_level(current_user.xp_points)
    current_user.xp_points += amount
    new_level = calculate_level(current_user.xp_points)

    transaction = XPTransaction(
        user_id=current_user.id,
        amount=amount,
        reason=reason,
    )
    db.add(transaction)
    db.commit()

    return XPGainResponse(
        xp_gained=amount,
        total_xp=current_user.xp_points,
        reason=reason,
        new_level=new_level if new_level > old_level else None,
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

    meals_cooked = sum(1 for t in xp_this_week if "cook" in (t.reason or "").lower() or "meal" in (t.reason or "").lower())
    recipes_saved = (
        db.query(SavedRecipe)
        .filter(SavedRecipe.user_id == current_user.id, SavedRecipe.saved_at >= week_ago)
        .count()
    )
    foods_explored = sum(1 for t in xp_this_week if "explore" in (t.reason or "").lower() or "browse" in (t.reason or "").lower())

    return {
        "meals_cooked": meals_cooked,
        "recipes_saved": recipes_saved,
        "foods_explored": foods_explored,
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

    return {"message": "Streak updated", "streak": current_user.current_streak}
