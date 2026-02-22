"""
Achievement definitions + automatic unlock engine.
Runs after user actions to check if new achievements should be awarded.
"""
import uuid
import logging
from datetime import datetime
from sqlalchemy.orm import Session
from app.models.gamification import Achievement, UserAchievement, XPTransaction
from app.models.user import User

logger = logging.getLogger(__name__)

ACHIEVEMENT_DEFS = [
    {
        "name": "First Healthify",
        "description": "Transform your first food into a whole-food version.",
        "icon": "sparkles",
        "xp_reward": 50,
        "category": "chat",
        "criteria": {"type": "healthify_count", "target": 1},
    },
    {
        "name": "Healthify Regular",
        "description": "Healthify 10 different foods.",
        "icon": "sparkles",
        "xp_reward": 150,
        "category": "chat",
        "criteria": {"type": "healthify_count", "target": 10},
    },
    {
        "name": "Healthify Master",
        "description": "Healthify 50 different foods.",
        "icon": "sparkles",
        "xp_reward": 500,
        "category": "chat",
        "criteria": {"type": "healthify_count", "target": 50},
    },
    {
        "name": "Meal Planner",
        "description": "Create your first meal plan.",
        "icon": "restaurant",
        "xp_reward": 200,
        "category": "planning",
        "criteria": {"type": "meal_plan_count", "target": 1},
    },
    {
        "name": "Week Warrior",
        "description": "Generate 4 weekly meal plans.",
        "icon": "calendar",
        "xp_reward": 400,
        "category": "planning",
        "criteria": {"type": "meal_plan_count", "target": 4},
    },
    {
        "name": "Grocery Pro",
        "description": "Generate 3 grocery lists.",
        "icon": "cart",
        "xp_reward": 150,
        "category": "shopping",
        "criteria": {"type": "grocery_count", "target": 3},
    },
    {
        "name": "Recipe Collector",
        "description": "Save 5 recipes to your collection.",
        "icon": "bookmark",
        "xp_reward": 100,
        "category": "discovery",
        "criteria": {"type": "saved_recipe_count", "target": 5},
    },
    {
        "name": "Recipe Hoarder",
        "description": "Save 25 recipes to your collection.",
        "icon": "library",
        "xp_reward": 300,
        "category": "discovery",
        "criteria": {"type": "saved_recipe_count", "target": 25},
    },
    {
        "name": "Food Explorer",
        "description": "Browse recipes from 5 different cuisines.",
        "icon": "earth",
        "xp_reward": 100,
        "category": "discovery",
        "criteria": {"type": "cuisines_explored", "target": 5},
    },
    {
        "name": "World Traveler",
        "description": "Browse recipes from 10 different cuisines.",
        "icon": "airplane",
        "xp_reward": 250,
        "category": "discovery",
        "criteria": {"type": "cuisines_explored", "target": 10},
    },
    {
        "name": "Streak Starter",
        "description": "Maintain a 3-day streak.",
        "icon": "flame",
        "xp_reward": 100,
        "category": "consistency",
        "criteria": {"type": "streak", "target": 3},
    },
    {
        "name": "Streak Master",
        "description": "Maintain a 7-day streak.",
        "icon": "flame",
        "xp_reward": 300,
        "category": "consistency",
        "criteria": {"type": "streak", "target": 7},
    },
    {
        "name": "Streak Legend",
        "description": "Maintain a 30-day streak.",
        "icon": "medal",
        "xp_reward": 1000,
        "category": "consistency",
        "criteria": {"type": "streak", "target": 30},
    },
    {
        "name": "First Steps",
        "description": "Reach Level 2.",
        "icon": "star",
        "xp_reward": 50,
        "category": "progression",
        "criteria": {"type": "level", "target": 2},
    },
    {
        "name": "Rising Star",
        "description": "Reach Level 5.",
        "icon": "star",
        "xp_reward": 200,
        "category": "progression",
        "criteria": {"type": "level", "target": 5},
    },
    {
        "name": "Elite Chef",
        "description": "Reach Level 10.",
        "icon": "trophy",
        "xp_reward": 500,
        "category": "progression",
        "criteria": {"type": "level", "target": 10},
    },
]


def seed_achievements(db: Session):
    """Insert achievement definitions if they don't exist."""
    existing = {a.name for a in db.query(Achievement.name).all()}
    added = 0
    for defn in ACHIEVEMENT_DEFS:
        if defn["name"] in existing:
            continue
        db.add(Achievement(
            id=str(uuid.uuid4()),
            name=defn["name"],
            description=defn["description"],
            icon=defn["icon"],
            xp_reward=defn["xp_reward"],
            category=defn["category"],
            criteria=defn["criteria"],
        ))
        added += 1
    if added:
        db.commit()
        logger.info("Seeded %d achievements.", added)


def check_achievements(db: Session, user: User, context: dict | None = None) -> list[dict]:
    """
    Check all achievements against current user state.
    Returns list of newly unlocked achievements.
    `context` can provide pre-computed counts to avoid extra queries.
    """
    from app.models.meal_plan import MealPlan
    from app.models.grocery import GroceryList

    unlocked_ids = {
        str(ua.achievement_id)
        for ua in db.query(UserAchievement).filter(UserAchievement.user_id == user.id).all()
    }

    all_achievements = db.query(Achievement).all()
    newly_unlocked = []

    ctx = context or {}
    xp_per_level = 1000

    for ach in all_achievements:
        if str(ach.id) in unlocked_ids:
            continue

        criteria = ach.criteria or {}
        ctype = criteria.get("type")
        target = criteria.get("target", 0)
        met = False

        if ctype == "streak":
            met = (user.current_streak or 0) >= target
        elif ctype == "level":
            level = ((user.xp_points or 0) // xp_per_level) + 1
            met = level >= target
        elif ctype == "healthify_count":
            count = ctx.get("healthify_count")
            if count is None:
                count = _count_xp_transactions(db, user.id, "healthify")
            met = count >= target
        elif ctype == "meal_plan_count":
            count = ctx.get("meal_plan_count")
            if count is None:
                count = db.query(MealPlan).filter(MealPlan.user_id == user.id).count()
            met = count >= target
        elif ctype == "grocery_count":
            count = ctx.get("grocery_count")
            if count is None:
                count = db.query(GroceryList).filter(GroceryList.user_id == user.id).count()
            met = count >= target
        elif ctype == "saved_recipe_count":
            count = ctx.get("saved_recipe_count", 0)
            met = count >= target
        elif ctype == "cuisines_explored":
            count = ctx.get("cuisines_explored", 0)
            met = count >= target

        if met:
            ua = UserAchievement(
                id=str(uuid.uuid4()),
                user_id=user.id,
                achievement_id=ach.id,
                unlocked_at=datetime.utcnow(),
            )
            db.add(ua)

            user.xp_points = (user.xp_points or 0) + ach.xp_reward
            db.add(XPTransaction(
                id=str(uuid.uuid4()),
                user_id=user.id,
                amount=ach.xp_reward,
                reason=f"achievement:{ach.name}",
            ))

            newly_unlocked.append({
                "id": str(ach.id),
                "name": ach.name,
                "description": ach.description,
                "icon": ach.icon,
                "xp_reward": ach.xp_reward,
                "category": ach.category,
            })

    if newly_unlocked:
        db.commit()

    return newly_unlocked


def _count_xp_transactions(db: Session, user_id: str, reason_prefix: str) -> int:
    return db.query(XPTransaction).filter(
        XPTransaction.user_id == user_id,
        XPTransaction.reason.like(f"{reason_prefix}%"),
    ).count()
