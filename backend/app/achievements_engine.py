"""
Achievement definitions + automatic unlock engine.
Runs after user actions to check if new achievements should be awarded.
"""
import uuid
import logging
from datetime import datetime, timedelta, date
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.gamification import Achievement, UserAchievement, XPTransaction, NutritionStreak
from app.models.nutrition import DailyNutritionSummary, FoodLog
from app.models.user import User

logger = logging.getLogger(__name__)

# ─── Level titles (food-themed) ───
LEVEL_TITLES = {
    1: "Curious Cook",
    2: "Kitchen Explorer",
    3: "Whole Food Rookie",
    4: "Nourishment Seeker",
    5: "Whole Food Warrior",
    6: "Nutrition Navigator",
    7: "Clean Eating Champion",
    8: "Macro Master",
    9: "Micronutrient Maven",
    10: "Nutrition Master",
    11: "Culinary Virtuoso",
    12: "Superfood Sage",
    13: "Wellness Architect",
    14: "Legendary Nourisher",
    15: "Whole Food Grandmaster",
}


def level_title(level: int) -> str:
    if level in LEVEL_TITLES:
        return LEVEL_TITLES[level]
    return f"Grandmaster (Lv.{level})"


ACHIEVEMENT_DEFS = [
    # ── Chat / Healthify ──
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
    # ── Planning ──
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
    # ── Shopping ──
    {
        "name": "Grocery Pro",
        "description": "Generate 3 grocery lists.",
        "icon": "cart",
        "xp_reward": 150,
        "category": "shopping",
        "criteria": {"type": "grocery_count", "target": 3},
    },
    # ── Discovery ──
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
    # ── Consistency / Streaks ──
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
    # ── Level-based ──
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
    # ═══════════════════════════════════
    # NEW — Nutrition achievements
    # ═══════════════════════════════════
    # ── Nutrition Streaks ──
    {
        "name": "Bronze Eater",
        "description": "Achieve a nutrition score ≥ 60 for 3 consecutive days.",
        "icon": "nutrition",
        "xp_reward": 150,
        "category": "nutrition",
        "criteria": {"type": "nutrition_streak", "target": 3},
    },
    {
        "name": "Silver Plate",
        "description": "Achieve a nutrition score ≥ 60 for 7 consecutive days.",
        "icon": "nutrition",
        "xp_reward": 400,
        "category": "nutrition",
        "criteria": {"type": "nutrition_streak", "target": 7},
    },
    {
        "name": "Golden Fork",
        "description": "Achieve a nutrition score ≥ 60 for 14 consecutive days.",
        "icon": "nutrition",
        "xp_reward": 800,
        "category": "nutrition",
        "criteria": {"type": "nutrition_streak", "target": 14},
    },
    {
        "name": "Diamond Diet",
        "description": "Achieve a nutrition score ≥ 60 for 30 consecutive days.",
        "icon": "nutrition",
        "xp_reward": 1500,
        "category": "nutrition",
        "criteria": {"type": "nutrition_streak", "target": 30},
    },
    # ── Tier-based daily scores ──
    {
        "name": "First Bronze Day",
        "description": "Score ≥ 60 on your daily nutrition for the first time.",
        "icon": "ribbon",
        "xp_reward": 100,
        "category": "nutrition",
        "criteria": {"type": "bronze_days", "target": 1},
    },
    {
        "name": "Silver Standard",
        "description": "Score ≥ 75 on your daily nutrition 5 times.",
        "icon": "ribbon",
        "xp_reward": 300,
        "category": "nutrition",
        "criteria": {"type": "silver_days", "target": 5},
    },
    {
        "name": "Gold Plate Club",
        "description": "Score ≥ 90 on your daily nutrition 3 times.",
        "icon": "ribbon",
        "xp_reward": 500,
        "category": "nutrition",
        "criteria": {"type": "gold_days", "target": 3},
    },
    # ── Logging milestones ──
    {
        "name": "First Log",
        "description": "Log your first meal in the chronometer.",
        "icon": "create",
        "xp_reward": 50,
        "category": "nutrition",
        "criteria": {"type": "food_log_count", "target": 1},
    },
    {
        "name": "Meal Logger",
        "description": "Log 50 meals in the chronometer.",
        "icon": "create",
        "xp_reward": 250,
        "category": "nutrition",
        "criteria": {"type": "food_log_count", "target": 50},
    },
    {
        "name": "Nutrition Nerd",
        "description": "Log 200 meals in the chronometer.",
        "icon": "create",
        "xp_reward": 600,
        "category": "nutrition",
        "criteria": {"type": "food_log_count", "target": 200},
    },
    # ── Weekly nutrition challenges ──
    {
        "name": "Iron Week",
        "description": "Hit your iron target 5 out of 7 days this week.",
        "icon": "shield-checkmark",
        "xp_reward": 300,
        "category": "nutrition",
        "criteria": {"type": "weekly_nutrient_hit", "nutrient": "iron_mg", "days_required": 5},
    },
    {
        "name": "Macro Master",
        "description": "All macros within 10% of targets for a full week.",
        "icon": "analytics",
        "xp_reward": 500,
        "category": "nutrition",
        "criteria": {"type": "macro_master_week", "days_required": 7},
    },
    {
        "name": "Whole Food Warrior",
        "description": "Log 21 meals this week, all from recipes.",
        "icon": "leaf",
        "xp_reward": 400,
        "category": "nutrition",
        "criteria": {"type": "whole_food_week", "meal_count": 21},
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


# ─── Helper: award XP and log transaction ───
def award_xp(db: Session, user: User, amount: int, reason: str) -> dict:
    """Central XP awarding — creates transaction and updates user total."""
    xp_per_level = 1000
    old_level = ((user.xp_points or 0) // xp_per_level) + 1
    user.xp_points = (user.xp_points or 0) + amount
    new_level = (user.xp_points // xp_per_level) + 1

    db.add(XPTransaction(
        id=str(uuid.uuid4()),
        user_id=user.id,
        amount=amount,
        reason=reason,
    ))
    db.commit()

    return {
        "xp_gained": amount,
        "total_xp": user.xp_points,
        "new_level": new_level if new_level > old_level else None,
        "level_title": level_title(new_level) if new_level > old_level else None,
    }


# ─── Nutrition streak updater ───
def update_nutrition_streak(db: Session, user: User, daily_score: float, day: date | None = None) -> dict:
    """Call after daily score is computed. Updates the nutrition streak."""
    today = day or datetime.utcnow().date()

    ns = db.query(NutritionStreak).filter(NutritionStreak.user_id == user.id).first()
    if not ns:
        ns = NutritionStreak(user_id=user.id, threshold=60.0)
        db.add(ns)
        db.commit()
        db.refresh(ns)

    threshold = ns.threshold or 60.0
    qualifies = daily_score >= threshold

    if qualifies:
        last_q = ns.last_qualifying_date
        if last_q and (today - last_q).days == 1:
            ns.current_streak += 1
        elif last_q == today:
            pass  # already counted today
        else:
            ns.current_streak = 1
        ns.last_qualifying_date = today
        if ns.current_streak > (ns.longest_streak or 0):
            ns.longest_streak = ns.current_streak
    else:
        if ns.last_qualifying_date and ns.last_qualifying_date != today:
            if (today - ns.last_qualifying_date).days > 1:
                ns.current_streak = 0

    db.commit()

    # Tier XP for the day (only once per day, tracked via XP transactions)
    tier_xp = 0
    tier_label = None
    if qualifies:
        existing_tier_today = db.query(XPTransaction).filter(
            XPTransaction.user_id == user.id,
            XPTransaction.reason.like(f"nutrition_tier:%"),
            XPTransaction.created_at >= datetime.combine(today, datetime.min.time()),
        ).first()
        if not existing_tier_today:
            if daily_score >= 90:
                tier_xp = 200
                tier_label = "Gold"
            elif daily_score >= 75:
                tier_xp = 100
                tier_label = "Silver"
            else:
                tier_xp = 50
                tier_label = "Bronze"
            award_xp(db, user, tier_xp, f"nutrition_tier:{tier_label}")

    return {
        "current_streak": ns.current_streak,
        "longest_streak": ns.longest_streak,
        "qualifies": qualifies,
        "tier_label": tier_label,
        "tier_xp": tier_xp,
    }


def _count_nutrition_days(db: Session, user_id: str, min_score: float) -> int:
    """Count total days with daily_score >= min_score."""
    return db.query(DailyNutritionSummary).filter(
        DailyNutritionSummary.user_id == user_id,
        DailyNutritionSummary.daily_score >= min_score,
    ).count()


def _check_weekly_nutrient(db: Session, user_id: str, nutrient: str, days_required: int) -> bool:
    """Check if user hit a specific nutrient target for N days in the last 7."""
    week_ago = datetime.utcnow().date() - timedelta(days=7)
    summaries = db.query(DailyNutritionSummary).filter(
        DailyNutritionSummary.user_id == user_id,
        DailyNutritionSummary.date >= week_ago,
    ).all()
    hits = 0
    for s in summaries:
        comp = (s.comparison_json or {}).get(nutrient, {})
        if float(comp.get("pct", 0) or 0) >= 100:
            hits += 1
    return hits >= days_required


def _check_macro_master(db: Session, user_id: str, days_required: int) -> bool:
    """All macros within 10% of targets for N days in last 7."""
    week_ago = datetime.utcnow().date() - timedelta(days=7)
    summaries = db.query(DailyNutritionSummary).filter(
        DailyNutritionSummary.user_id == user_id,
        DailyNutritionSummary.date >= week_ago,
    ).all()
    perfect_days = 0
    for s in summaries:
        comp = s.comparison_json or {}
        all_good = True
        for macro in ["protein", "carbs", "fat", "fiber"]:
            pct = float(comp.get(macro, {}).get("pct", 0) or 0)
            if pct < 90 or pct > 110:
                all_good = False
                break
        if all_good:
            perfect_days += 1
    return perfect_days >= days_required


def _check_whole_food_week(db: Session, user_id: str, meal_count: int) -> bool:
    """Check if user logged N meals from recipes in the last 7 days."""
    week_ago = datetime.utcnow().date() - timedelta(days=7)
    recipe_logs = db.query(FoodLog).filter(
        FoodLog.user_id == user_id,
        FoodLog.date >= week_ago,
        FoodLog.source_type.in_(["recipe", "cook_mode", "meal_plan"]),
    ).count()
    return recipe_logs >= meal_count


def check_achievements(db: Session, user: User, context: dict | None = None) -> list[dict]:
    """
    Check all achievements against current user state.
    Returns list of newly unlocked achievements.
    `context` can provide pre-computed counts to avoid extra queries.
    """
    from app.models.meal_plan import MealPlan
    from app.models.grocery import GroceryList
    from app.models.saved_recipe import SavedRecipe
    from app.models.recipe import Recipe

    unlocked_ids = {
        str(ua.achievement_id)
        for ua in db.query(UserAchievement).filter(UserAchievement.user_id == user.id).all()
    }

    all_achievements = db.query(Achievement).all()
    newly_unlocked = []

    ctx = context or {}
    xp_per_level = 1000

    # Pre-compute counts that were previously missing
    if "saved_recipe_count" not in ctx:
        ctx["saved_recipe_count"] = db.query(SavedRecipe).filter(
            SavedRecipe.user_id == user.id
        ).count()
    if "cuisines_explored" not in ctx:
        saved_recipe_ids = [
            sr.recipe_id for sr in
            db.query(SavedRecipe.recipe_id).filter(SavedRecipe.user_id == user.id).all()
            if sr.recipe_id
        ]
        if saved_recipe_ids:
            ctx["cuisines_explored"] = db.query(func.count(func.distinct(Recipe.cuisine))).filter(
                Recipe.id.in_(saved_recipe_ids)
            ).scalar() or 0
        else:
            ctx["cuisines_explored"] = 0
    if "food_log_count" not in ctx:
        ctx["food_log_count"] = db.query(FoodLog).filter(FoodLog.user_id == user.id).count()

    # Nutrition streak
    ns = db.query(NutritionStreak).filter(NutritionStreak.user_id == user.id).first()
    nutrition_streak_val = ns.current_streak if ns else 0

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
            met = ctx.get("saved_recipe_count", 0) >= target
        elif ctype == "cuisines_explored":
            met = ctx.get("cuisines_explored", 0) >= target
        # ── NEW nutrition types ──
        elif ctype == "nutrition_streak":
            met = nutrition_streak_val >= target
        elif ctype == "bronze_days":
            met = _count_nutrition_days(db, user.id, 60) >= target
        elif ctype == "silver_days":
            met = _count_nutrition_days(db, user.id, 75) >= target
        elif ctype == "gold_days":
            met = _count_nutrition_days(db, user.id, 90) >= target
        elif ctype == "food_log_count":
            met = ctx.get("food_log_count", 0) >= target
        elif ctype == "weekly_nutrient_hit":
            nutrient = criteria.get("nutrient", "")
            days_req = criteria.get("days_required", 5)
            met = _check_weekly_nutrient(db, user.id, nutrient, days_req)
        elif ctype == "macro_master_week":
            days_req = criteria.get("days_required", 7)
            met = _check_macro_master(db, user.id, days_req)
        elif ctype == "whole_food_week":
            meal_req = criteria.get("meal_count", 21)
            met = _check_whole_food_week(db, user.id, meal_req)

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
