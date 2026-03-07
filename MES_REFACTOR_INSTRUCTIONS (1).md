# MES Scoring Engine — Full Refactor Instructions
> **For:** Claude Opus 4.6  
> **File:** `backend/app/services/metabolic_engine.py`  
> **Scope:** Full rewrite of the MES scoring engine. Do not change any API route signatures, database schema, or unrelated service files unless explicitly stated below. All changes are backwards-compatible unless a migration note is provided.

---

## Context

This is the metabolic scoring engine for Whole Food Labs, a metabolic health app. The engine scores meals and daily intake with a "MES" (Metabolic Efficiency Score, 0–100). The current implementation has several critical issues that produce inaccurate and misleading scores. This document provides exact replacement logic for every function in `metabolic_engine.py`.

Read this entire document before writing any code.

---

## Table of Contents

1. [Summary of All Changes](#1-summary-of-all-changes)
2. [New User Profile Schema](#2-new-user-profile-schema-metabprofile)
3. [New Core Constants & Defaults](#3-new-core-constants--defaults)
4. [New Helper Functions](#4-new-helper-functions)
5. [Metabolic Budget Builder](#5-metabolic-budget-builder-build_metabolic_budget)
6. [Sub-Score Functions](#6-sub-score-functions)
7. [Meal MES — Full Replacement](#7-meal-mes--full-replacement-compute_meal_mes)
8. [Daily MES — Full Replacement](#8-daily-mes--full-replacement-compute_daily_mes)
9. [Tier & Display Logic](#9-tier--display-logic)
10. [Dynamic Tier Thresholds](#10-dynamic-tier-thresholds)
11. [MEA Score — New Addition](#11-mea-score--new-addition)
12. [Treat Impact — Keep With Adjustments](#12-treat-impact--keep-with-adjustments)
13. [Onboarding & Settings Integration](#13-onboarding--settings-integration)
14. [API Response Shape Changes](#14-api-response-shape-changes)
15. [Migration & Compatibility Notes](#15-migration--compatibility-notes)
16. [Testing Checklist](#16-testing-checklist)

---

## 1. Summary of All Changes

| # | Change | Priority | Type |
|---|---|---|---|
| 1 | Lower carb ceiling from 200g → dynamic (default 130g) | 🔴 Critical | Modify |
| 2 | Replace cliff `sugar_score` with linear GIS using net carbs | 🔴 Critical | Replace |
| 3 | Remove `display_score = raw + 10` inflation | 🔴 Critical | Remove |
| 4 | Rebalance weights: add fat (0.35/0.30/0.20/0.15) | 🔴 Critical | Modify |
| 5 | Add `calc_fas()` fat sub-score | 🔴 Critical | Add |
| 6 | Add `MetabolicProfile` dataclass and `build_metabolic_budget()` | 🟠 High | Add |
| 7 | Make protein target weight-based from user profile | 🟠 High | Modify |
| 8 | Add Insulin Sensitivity Modifier (ISM) from body fat % | 🟠 High | Add |
| 9 | Add activity level and goal modifiers to budget | 🟠 High | Add |
| 10 | Add `calc_tier_thresholds()` — dynamic thresholds per profile | 🟠 High | Add |
| 11 | Update `score_to_tier()` to accept dynamic thresholds | 🟠 High | Modify |
| 12 | Add `UserMetabolicSettings` DB model and profile endpoints | 🟠 High | Add |
| 13 | Add onboarding flow schema (Step 1 / Step 2 / Step 3) | 🟠 High | Add |
| 14 | Tighten base tier thresholds (85/70/55/40) | 🟡 Medium | Modify |
| 15 | Rename `sugar_ceiling_g` → `carb_ceiling_g` throughout | 🟡 Medium | Rename |
| 16 | Add `MEAScore` dataclass and `compute_mea_score()` | 🟡 Medium | Add |
| 17 | Adjust treat impact protection formula for new weights | 🟡 Medium | Modify |

---

## 2. New User Profile Schema (`MetabolicProfile`)

Add this dataclass to `metabolic_engine.py`. It is the input for `build_metabolic_budget()`. All fields except `weight_kg`, `height_cm`, `age`, `sex` have safe defaults so existing callers are not broken.

```python
from dataclasses import dataclass, field
from typing import Optional
from enum import Enum

class Goal(str, Enum):
    FAT_LOSS        = "fat_loss"
    MUSCLE_GAIN     = "muscle_gain"
    MAINTENANCE     = "maintenance"
    METABOLIC_RESET = "metabolic_reset"

class ActivityLevel(str, Enum):
    SEDENTARY = "sedentary"   # desk job, no exercise
    MODERATE  = "moderate"    # 3–4x/week light exercise
    ACTIVE    = "active"      # 5+x/week training
    ATHLETIC  = "athletic"    # daily intense training / athlete

@dataclass
class MetabolicProfile:
    # ----- Required biometrics -----
    weight_kg:   float
    height_cm:   float
    age:         int
    sex:         str   # "male" | "female"

    # ----- Optional — defaults produce safe neutral scoring -----
    body_fat_pct:    Optional[float] = None    # e.g. 22.5
    activity_level:  ActivityLevel  = ActivityLevel.MODERATE
    goal:            Goal           = Goal.MAINTENANCE

    # ----- Health flags (Phase 1.5) -----
    insulin_resistant:   bool = False
    prediabetes:         bool = False
    type_2_diabetes:     bool = False

    # ----- Lab values (Phase 2, optional) -----
    fasting_glucose_mgdl:  Optional[float] = None
    hba1c_pct:             Optional[float] = None
    triglycerides_mgdl:    Optional[float] = None
```

**Where this comes from:** Pull from the user's profile record in the database. If the user has not completed their profile, instantiate with safe defaults:

```python
DEFAULT_PROFILE = MetabolicProfile(
    weight_kg=75,
    height_cm=170,
    age=30,
    sex="male",
    activity_level=ActivityLevel.MODERATE,
    goal=Goal.MAINTENANCE,
)
```

---

## 3. New Core Constants & Defaults

Replace the existing constants block entirely:

```python
# ── Scoring constants ──────────────────────────────────────────────
MEALS_PER_DAY = 3

# Base weights (before ISM adjustment)
BASE_WEIGHT_GIS     = 0.35
BASE_WEIGHT_PROTEIN = 0.30
BASE_WEIGHT_FIBER   = 0.20
BASE_WEIGHT_FAT     = 0.15

# Carb ceiling defaults (g/day)
CARB_CEILING_DEFAULT_G    = 130   # neutral/maintenance
CARB_CEILING_IR_G         = 90    # insulin resistant / T2D
CARB_CEILING_ATHLETIC_G   = 175   # high-activity users

# Protein targets (g/kg/day)
PROTEIN_RATIO_MAINTENANCE  = 1.6
PROTEIN_RATIO_FAT_LOSS     = 1.8
PROTEIN_RATIO_MUSCLE_GAIN  = 2.2
PROTEIN_RATIO_METABOLIC    = 1.8

# Fiber target
FIBER_TARGET_G_PER_KG = 0.40   # ~30g for 75kg person
FIBER_FLOOR_MINIMUM_G = 25.0

# Tier thresholds
TIER_OPTIMAL  = 85
TIER_GOOD     = 70
TIER_MODERATE = 55
TIER_LOW      = 40
# below TIER_LOW = "critical"

# REMOVED: display_score = raw + 10 — do not re-add this
```

---

## 4. New Helper Functions

Add these helper functions. They are called by `build_metabolic_budget()`.

### 4a. TDEE Calculator (Mifflin-St Jeor)

```python
def calc_tdee(profile: MetabolicProfile) -> float:
    """Mifflin-St Jeor BMR × activity multiplier."""
    if profile.sex == "male":
        bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age + 5
    else:
        bmr = 10 * profile.weight_kg + 6.25 * profile.height_cm - 5 * profile.age - 161

    multipliers = {
        ActivityLevel.SEDENTARY: 1.2,
        ActivityLevel.MODERATE:  1.55,
        ActivityLevel.ACTIVE:    1.725,
        ActivityLevel.ATHLETIC:  1.9,
    }
    return round(bmr * multipliers[profile.activity_level], 1)
```

### 4b. Protein Target

```python
def calc_protein_target_g(profile: MetabolicProfile) -> float:
    """Daily protein target in grams, adjusted for goal and age."""
    ratios = {
        Goal.MAINTENANCE:     PROTEIN_RATIO_MAINTENANCE,
        Goal.FAT_LOSS:        PROTEIN_RATIO_FAT_LOSS,
        Goal.MUSCLE_GAIN:     PROTEIN_RATIO_MUSCLE_GAIN,
        Goal.METABOLIC_RESET: PROTEIN_RATIO_METABOLIC,
    }
    base_ratio = ratios[profile.goal]

    # Older users have anabolic resistance — increase protein target
    age_bonus = 0.15 if profile.age >= 50 else (0.05 if profile.age >= 40 else 0)

    return round(profile.weight_kg * (base_ratio + age_bonus), 1)
```

### 4c. Carb Ceiling

```python
def calc_carb_ceiling_g(profile: MetabolicProfile) -> float:
    """
    Daily net carb ceiling in grams.
    Stricter for insulin-resistant/diabetic users.
    More lenient for athletic users.
    """
    # Start from base
    if profile.type_2_diabetes or profile.insulin_resistant:
        base = CARB_CEILING_IR_G
    elif profile.activity_level == ActivityLevel.ATHLETIC:
        base = CARB_CEILING_ATHLETIC_G
    elif profile.activity_level == ActivityLevel.ACTIVE:
        base = CARB_CEILING_DEFAULT_G + 25
    else:
        base = CARB_CEILING_DEFAULT_G

    # Prediabetes modifier
    if profile.prediabetes:
        base = min(base, 110)

    # High triglycerides → tighten carbs (trigs are a dietary carb marker)
    if profile.triglycerides_mgdl and profile.triglycerides_mgdl > 150:
        base = round(base * 0.80)

    # Fat loss goal → reduce carb ceiling
    if profile.goal == Goal.FAT_LOSS:
        base = round(base * 0.85)

    return float(base)
```

### 4d. Insulin Sensitivity Modifier (ISM)

```python
def calc_ism(profile: MetabolicProfile) -> float:
    """
    Returns a multiplier applied to the GIS weight.
    Higher body fat or metabolic disease → GIS penalizes harder.
    Returns 1.0 (neutral) if body_fat_pct is unknown.
    """
    # Hard overrides for diagnosed conditions
    if profile.type_2_diabetes:
        return 1.35
    if profile.insulin_resistant:
        return 1.25
    if profile.prediabetes:
        return 1.15

    # Body-fat based
    if profile.body_fat_pct is None:
        return 1.0   # neutral if unknown

    lean_threshold    = 18.0 if profile.sex == "male" else 25.0
    overfat_threshold = 25.0 if profile.sex == "male" else 33.0

    if profile.body_fat_pct <= lean_threshold:
        return 0.85   # lean = more carb tolerant
    if profile.body_fat_pct <= overfat_threshold:
        return 1.0    # baseline
    return 1.20       # overfat = penalize glycemic impact harder
```

### 4e. Fat Target

```python
def calc_fat_target_g(tdee: float, carb_g: float, protein_g: float) -> float:
    """
    Fat fills remaining calories after protein and carbs are allocated.
    Carbs: 4 kcal/g, Protein: 4 kcal/g, Fat: 9 kcal/g
    """
    calories_from_protein = protein_g * 4
    calories_from_carbs   = carb_g * 4
    calories_from_fat     = tdee - calories_from_protein - calories_from_carbs
    fat_g = calories_from_fat / 9
    return round(max(40.0, fat_g), 1)   # floor of 40g for hormonal health
```

---

## 5. Metabolic Budget Builder (`build_metabolic_budget`)

This is the central function that produces a `MetabolicBudget` for any user. Replace the old hardcoded budget object with this.

```python
@dataclass
class ScoreWeights:
    gis:     float
    protein: float
    fiber:   float
    fat:     float

    def normalized(self) -> "ScoreWeights":
        """Ensure weights always sum to exactly 1.0."""
        total = self.gis + self.protein + self.fiber + self.fat
        return ScoreWeights(
            gis     = self.gis     / total,
            protein = self.protein / total,
            fiber   = self.fiber   / total,
            fat     = self.fat     / total,
        )

@dataclass
class MetabolicBudget:
    tdee:            float
    protein_g:       float
    carb_ceiling_g:  float
    fiber_g:         float
    fat_g:           float
    weights:         ScoreWeights
    ism:             float    # stored for transparency / debug response


def build_metabolic_budget(profile: MetabolicProfile) -> MetabolicBudget:
    """
    Derives all scoring targets and weights from the user's MetabolicProfile.
    This replaces all hardcoded default values.
    """
    tdee       = calc_tdee(profile)
    protein_g  = calc_protein_target_g(profile)
    carb_g     = calc_carb_ceiling_g(profile)
    fiber_g    = max(FIBER_FLOOR_MINIMUM_G, profile.weight_kg * FIBER_TARGET_G_PER_KG)
    fat_g      = calc_fat_target_g(tdee, carb_g, protein_g)
    ism        = calc_ism(profile)

    # Adjust GIS weight via ISM, cap at 0.50
    gis_weight     = min(0.50, BASE_WEIGHT_GIS * ism)

    # Muscle gain → protein matters more
    protein_weight = BASE_WEIGHT_PROTEIN + (0.05 if profile.goal == Goal.MUSCLE_GAIN else 0)

    fiber_weight   = BASE_WEIGHT_FIBER
    fat_weight     = BASE_WEIGHT_FAT

    weights = ScoreWeights(
        gis=gis_weight,
        protein=protein_weight,
        fiber=fiber_weight,
        fat=fat_weight,
    ).normalized()

    return MetabolicBudget(
        tdee=tdee,
        protein_g=protein_g,
        carb_ceiling_g=carb_g,
        fiber_g=fiber_g,
        fat_g=fat_g,
        weights=weights,
        ism=ism,
    )
```

---

## 6. Sub-Score Functions

These replace the inline score expressions in the old `compute_meal_mes`. Each returns a float `0–100`.

### 6a. GIS — Glycemic Impact Score (replaces `sugar_score`)

```python
def calc_gis(net_carbs_g: float) -> float:
    """
    Linear degradation curve based on net carbs (total carbs minus fiber).
    Fiber intentionally reduces GIS AND earns its own fiber sub-score.
    Returns 0–100.
    """
    if net_carbs_g <= 10:  return 100.0
    if net_carbs_g <= 20:  return 100.0 - ((net_carbs_g - 10)  / 10)  * 20
    if net_carbs_g <= 35:  return 80.0  - ((net_carbs_g - 20)  / 15)  * 25
    if net_carbs_g <= 55:  return 55.0  - ((net_carbs_g - 35)  / 20)  * 30
    if net_carbs_g <= 80:  return 25.0  - ((net_carbs_g - 55)  / 25)  * 20
    return 0.0
```

> **Why this replaces the old formula:** The old `sugar_score = max(0, 100 - max(0, sugar_ratio - 1) * 200)` is flat at 100 until the ceiling is hit, then collapses suddenly. This new curve differentiates a 20g-carb meal from a 50g-carb meal meaningfully.

### 6b. PAS — Protein Adequacy Score

```python
def calc_pas(protein_g: float, target_g: float) -> float:
    """
    Scores protein against the per-meal target.
    Smooth curve — no cliff at the top.
    Returns 0–100.
    """
    if target_g <= 0:
        return 0.0
    ratio = protein_g / target_g
    if ratio >= 1.0:   return 100.0
    if ratio >= 0.75:  return 70.0 + ((ratio - 0.75) / 0.25) * 30
    if ratio >= 0.5:   return 40.0 + ((ratio - 0.5)  / 0.25) * 30
    if ratio >= 0.25:  return 10.0 + ((ratio - 0.25) / 0.25) * 30
    return max(0.0, ratio / 0.25 * 10)
```

### 6c. FS — Fiber Score

```python
def calc_fs(fiber_g: float) -> float:
    """
    Rewards fiber content with diminishing returns above 15g.
    Returns 0–100.
    """
    if fiber_g <= 0:   return 0.0
    if fiber_g <= 2:   return (fiber_g / 2) * 20
    if fiber_g <= 6:   return 20.0 + ((fiber_g - 2)  / 4)  * 45
    if fiber_g <= 10:  return 65.0 + ((fiber_g - 6)  / 4)  * 25
    if fiber_g <= 15:  return 90.0 + ((fiber_g - 10) / 5)  * 10
    return 100.0
```

### 6d. FAS — Fat Adequacy Score (new)

```python
def calc_fas(fat_g: float) -> float:
    """
    Penalizes both very low fat (hormonal/absorption issues)
    and excessive fat (caloric crowding). Sweet spot: 15–40g per meal.
    Returns 0–100.
    """
    if fat_g < 0:    return 0.0
    if fat_g < 5:    return (fat_g / 5) * 30
    if fat_g <= 15:  return 30.0  + ((fat_g - 5)  / 10) * 50
    if fat_g <= 40:  return 80.0  + ((fat_g - 15) / 25) * 20
    if fat_g <= 60:  return 100.0 - ((fat_g - 40) / 20) * 15
    return max(50.0, 85.0 - ((fat_g - 60) / 20) * 35)
```

---

## 7. Meal MES — Full Replacement (`compute_meal_mes`)

Replace the existing function entirely:

```python
def compute_meal_mes(nutrition: dict, budget: MetabolicBudget) -> dict:
    """
    Computes MES for a single full_meal entry.
    
    Args:
        nutrition: dict with keys protein_g, fiber_g, carbs_g, fat_g
                   (legacy keys protein, fiber, carbs, sugar_g also accepted)
        budget:    MetabolicBudget from build_metabolic_budget(profile)

    Returns:
        dict with keys: gis, pas, fs, fas, meal_mes, tier, sub_scores
    """
    # ── Nutrient extraction (with legacy key fallbacks) ─────────────
    protein_g = float(nutrition.get("protein_g") or nutrition.get("protein") or 0)
    fiber_g   = float(nutrition.get("fiber_g")   or nutrition.get("fiber")   or 0)
    carbs_g   = float(
        nutrition.get("carbs_g") or nutrition.get("carbs") or
        nutrition.get("sugar_g") or nutrition.get("sugar") or 0
    )
    fat_g     = float(nutrition.get("fat_g") or nutrition.get("fat") or 0)

    # ── Per-meal targets ─────────────────────────────────────────────
    protein_target = budget.protein_g    / MEALS_PER_DAY
    carb_ceiling   = budget.carb_ceiling_g / MEALS_PER_DAY
    fiber_target   = budget.fiber_g      / MEALS_PER_DAY
    # fat target not used in per-meal FAS; FAS curve is self-contained

    # ── Net carbs ────────────────────────────────────────────────────
    net_carbs_g = max(0.0, carbs_g - fiber_g)

    # ── Sub-scores ───────────────────────────────────────────────────
    gis = calc_gis(net_carbs_g)
    pas = calc_pas(protein_g, protein_target)
    fs  = calc_fs(fiber_g)
    fas = calc_fas(fat_g)

    # ── Weighted composite ───────────────────────────────────────────
    w = budget.weights
    raw_mes = (
        w.gis     * gis +
        w.protein * pas +
        w.fiber   * fs  +
        w.fat     * fas
    )
    raw_mes = round(raw_mes, 1)

    return {
        "meal_mes":   raw_mes,          # NO +10 inflation
        "tier":       score_to_tier(raw_mes),
        "sub_scores": {
            "gis": round(gis, 1),
            "pas": round(pas, 1),
            "fs":  round(fs,  1),
            "fas": round(fas, 1),
        },
        "weights_used": {
            "gis":     round(w.gis,     3),
            "protein": round(w.protein, 3),
            "fiber":   round(w.fiber,   3),
            "fat":     round(w.fat,     3),
        },
        "net_carbs_g": round(net_carbs_g, 1),
    }
```

---

## 8. Daily MES — Full Replacement (`compute_daily_mes`)

```python
def compute_daily_mes(daily_totals: dict, budget: MetabolicBudget) -> dict:
    """
    Computes daily MES from aggregated daily macro totals.
    Treat impact is applied separately via _compute_treat_impact().

    Args:
        daily_totals: dict with keys protein_g, fiber_g, carbs_g, fat_g,
                      calories, dessert_carbs_g, dessert_calories
        budget:       MetabolicBudget from build_metabolic_budget(profile)

    Returns:
        dict with base_daily_mes, treat_impact, daily_mes, tier
    """
    protein_g = float(daily_totals.get("protein_g", 0))
    fiber_g   = float(daily_totals.get("fiber_g",   0))
    carbs_g   = float(daily_totals.get("carbs_g") or daily_totals.get("sugar_g", 0))
    fat_g     = float(daily_totals.get("fat_g",     0))

    net_carbs_g = max(0.0, carbs_g - fiber_g)

    # ── Sub-scores against daily targets ────────────────────────────
    gis = calc_gis(net_carbs_g * (MEALS_PER_DAY / max(net_carbs_g, 1)) if net_carbs_g > 0 else 100)
    # NOTE: For daily GIS, scale net_carbs to per-meal equivalent for curve consistency:
    net_carbs_per_meal_equiv = net_carbs_g / MEALS_PER_DAY
    gis = calc_gis(net_carbs_per_meal_equiv)

    pas = calc_pas(protein_g, budget.protein_g)
    fs  = calc_fs(fiber_g / MEALS_PER_DAY)     # normalize to per-meal fiber curve
    fas = calc_fas(fat_g  / MEALS_PER_DAY)     # normalize to per-meal fat curve

    w = budget.weights
    base_total = round(
        w.gis     * gis +
        w.protein * pas +
        w.fiber   * fs  +
        w.fat     * fas,
        1
    )

    # ── Treat impact ─────────────────────────────────────────────────
    treat_impact = _compute_treat_impact(daily_totals, budget, protein_g, fiber_g, carbs_g)
    penalty      = treat_impact.get("mes_penalty_points", 0)

    daily_raw_mes = round(max(0.0, base_total - penalty), 1)

    return {
        "base_daily_mes": base_total,
        "daily_mes":      daily_raw_mes,    # NO +10 inflation
        "tier":           score_to_tier(daily_raw_mes),
        "treat_impact":   treat_impact,
        "sub_scores": {
            "gis": round(gis, 1),
            "pas": round(pas, 1),
            "fs":  round(fs,  1),
            "fas": round(fas, 1),
        },
    }
```

---

## 9. Tier & Display Logic

Replace `score_to_tier` to accept dynamic thresholds. **Remove the `display_score = raw + 10` logic wherever it appears.**

```python
def score_to_tier(score: float, thresholds: dict) -> str:
    """
    Maps a raw 0–100 MES score to a named tier.
    Thresholds are dynamic — pass result of calc_tier_thresholds(profile).
    For backwards-compatible calls where no profile is available,
    pass BASE_TIER_THRESHOLDS as the default.
    """
    if score >= thresholds["optimal"]:   return "optimal"
    if score >= thresholds["good"]:      return "good"
    if score >= thresholds["moderate"]:  return "moderate"
    if score >= thresholds["low"]:       return "low"
    return "critical"
```

Base thresholds constant (used as fallback when no profile is loaded):

```python
BASE_TIER_THRESHOLDS = {
    "optimal":  85,
    "good":     70,
    "moderate": 55,
    "low":      40,
}
```

### Tier → UI Labels and Energy Hints

```python
TIER_META = {
    "optimal":  {
        "label":  "Optimal",
        "emoji":  "🟢",
        "energy": "Sustained, stable energy all day",
    },
    "good":     {
        "label":  "Good",
        "emoji":  "🟡",
        "energy": "Good energy, minor dips possible",
    },
    "moderate": {
        "label":  "Moderate",
        "emoji":  "🟠",
        "energy": "Moderate energy, afternoon slump likely",
    },
    "low":      {
        "label":  "Low",
        "emoji":  "🔴",
        "energy": "Low energy, crashes likely",
    },
    "critical": {
        "label":  "Critical",
        "emoji":  "⛔",
        "energy": "Significant fatigue / metabolic stress",
    },
}
```

---

## 10. Dynamic Tier Thresholds

This is a new function. Tier thresholds shift based on how metabolically fit the user is. The same raw score of 72 means something different for a lean athlete vs. an insulin-resistant sedentary user — the thresholds encode that context.

### Core principle

- **Lean + athletic users** get more lenient thresholds. Their metabolism handles variance better; a score of 72 is genuinely "good" for them.
- **Insulin-resistant, diabetic, or overfat users** get stricter thresholds. They have less metabolic margin; a 72 should read as "moderate" to signal they need to tighten up.
- Thresholds are capped to prevent absurd extremes (optimal can't require 100, low can't drop below 30).

```python
def calc_tier_thresholds(profile: MetabolicProfile) -> dict:
    """
    Returns personalized tier threshold boundaries based on metabolic fitness.

    Positive shift  = stricter (must score higher to reach same tier).
    Negative shift  = more lenient (same score earns a better tier).

    Stored on MetabolicBudget and included in API responses for transparency.
    """
    base = dict(BASE_TIER_THRESHOLDS)  # copy — do not mutate the constant

    # ── Determine shift ───────────────────────────────────────────────
    if profile.type_2_diabetes:
        shift = +10   # highest clinical risk — strictest thresholds
    elif profile.insulin_resistant:
        shift = +8
    elif profile.prediabetes:
        shift = +5
    elif (
        profile.body_fat_pct is not None and (
            (profile.sex == "male"   and profile.body_fat_pct > 25) or
            (profile.sex == "female" and profile.body_fat_pct > 33)
        )
    ):
        shift = +4    # overfat, no diagnosis yet — slightly stricter
    elif (
        profile.activity_level == ActivityLevel.ATHLETIC and
        profile.body_fat_pct is not None and (
            (profile.sex == "male"   and profile.body_fat_pct < 15) or
            (profile.sex == "female" and profile.body_fat_pct < 22)
        )
    ):
        shift = -8    # lean + athletic — most lenient
    elif profile.activity_level == ActivityLevel.ACTIVE:
        shift = -4
    elif profile.activity_level == ActivityLevel.SEDENTARY:
        shift = +2    # sedentary baseline — slightly stricter
    else:
        shift = 0     # MODERATE activity, average BF — neutral

    # ── Apply shift with safety caps ─────────────────────────────────
    return {
        "optimal":  min(95, max(75, base["optimal"]  + shift)),
        "good":     min(82, max(60, base["good"]     + shift)),
        "moderate": min(68, max(45, base["moderate"] + shift)),
        "low":      min(52, max(30, base["low"]      + shift)),
    }
```

### Add thresholds to `MetabolicBudget`

Update the `MetabolicBudget` dataclass to carry the thresholds so they flow through the system without recalculation:

```python
@dataclass
class MetabolicBudget:
    tdee:             float
    protein_g:        float
    carb_ceiling_g:   float
    fiber_g:          float
    fat_g:            float
    weights:          ScoreWeights
    ism:              float
    tier_thresholds:  dict    # ← ADD THIS FIELD
```

Update `build_metabolic_budget()` to populate it:

```python
def build_metabolic_budget(profile: MetabolicProfile) -> MetabolicBudget:
    # ... (all existing logic unchanged) ...
    tier_thresholds = calc_tier_thresholds(profile)   # ← ADD THIS LINE

    return MetabolicBudget(
        tdee=tdee,
        protein_g=protein_g,
        carb_ceiling_g=carb_g,
        fiber_g=fiber_g,
        fat_g=fat_g,
        weights=weights,
        ism=ism,
        tier_thresholds=tier_thresholds,              # ← ADD THIS LINE
    )
```

### Update all `score_to_tier()` call sites

Every call to `score_to_tier` must now pass `budget.tier_thresholds`:

```python
# In compute_meal_mes():
"tier": score_to_tier(raw_mes, budget.tier_thresholds),

# In compute_daily_mes():
"tier": score_to_tier(daily_raw_mes, budget.tier_thresholds),

# In compute_mea_score():
tier = score_to_tier(mea, budget.tier_thresholds),
```

### Concrete example — same score, different thresholds

| Profile | Shift | Optimal at | Good at | Score of 72 → |
|---|---|---|---|---|
| Athletic, 11% BF male | −8 | 77 | 62 | 🟢 **Optimal** |
| Moderate, avg BF | 0 | 85 | 70 | 🟡 **Good** |
| Sedentary, 28% BF | +4 | 89 | 74 | 🟠 **Moderate** |
| Insulin resistant | +8 | 93 | 78 | 🟠 **Moderate** |
| Type 2 diabetic | +10 | 95 | 80 | 🟠 **Moderate** |

---

## 11. MEA Score — New Addition

Add this as a new function. It sits above daily MES and incorporates caloric adequacy and macro balance to predict energy state.

```python
@dataclass
class MEAScore:
    caloric_adequacy:    float   # 0–100
    macro_balance:       float   # 0–100
    daily_mes:           float   # 0–100 (input)
    mea_score:           float   # 0–100 (composite)
    energy_prediction:   str     # "Optimal" | "Good" | "Moderate" | "Low" | "Critical"
    energy_description:  str     # human-readable string
    tier:                str     # same tier keys as MES


def calc_caloric_adequacy(consumed_kcal: float, tdee: float) -> float:
    """Scores how close consumed calories are to TDEE. Returns 0–100."""
    if tdee <= 0:
        return 50.0
    ratio = consumed_kcal / tdee
    if 0.90 <= ratio <= 1.10:  return 100.0
    if 0.75 <= ratio < 0.90:   return 60.0 + ((ratio - 0.75) / 0.15) * 40
    if 1.10 < ratio <= 1.25:   return 60.0 + ((1.25 - ratio) / 0.15) * 40
    if ratio < 0.75:           return max(0.0, (ratio / 0.75) * 60)
    return max(20.0, 60.0 - ((ratio - 1.25) / 0.25) * 40)


def calc_macro_balance(daily_totals: dict, budget: MetabolicBudget) -> float:
    """
    Scores how well actual macro distribution matches targets.
    Returns 0–100 (3 pts deducted per percentage-point deviation).
    """
    protein_g = float(daily_totals.get("protein_g", 0))
    carbs_g   = float(daily_totals.get("carbs_g") or daily_totals.get("sugar_g", 0))
    fat_g     = float(daily_totals.get("fat_g", 0))

    total_cals = (protein_g * 4) + (carbs_g * 4) + (fat_g * 9)
    if total_cals < 100:
        return 50.0   # insufficient data — neutral score

    actual_protein_pct = (protein_g * 4) / total_cals * 100
    actual_carb_pct    = (carbs_g   * 4) / total_cals * 100
    actual_fat_pct     = (fat_g     * 9) / total_cals * 100

    # Target macro distribution derived from budget
    target_protein_cals = budget.protein_g     * 4
    target_carb_cals    = budget.carb_ceiling_g * 4
    target_fat_cals     = budget.fat_g          * 9
    total_target_cals   = target_protein_cals + target_carb_cals + target_fat_cals

    target_protein_pct = (target_protein_cals / total_target_cals) * 100
    target_carb_pct    = (target_carb_cals    / total_target_cals) * 100
    target_fat_pct     = (target_fat_cals     / total_target_cals) * 100

    delta_protein = abs(actual_protein_pct - target_protein_pct)
    delta_carb    = abs(actual_carb_pct    - target_carb_pct)
    delta_fat     = abs(actual_fat_pct     - target_fat_pct)
    avg_delta     = (delta_protein + delta_carb + delta_fat) / 3

    return round(max(0.0, 100.0 - avg_delta * 3), 1)


def compute_mea_score(
    daily_totals: dict,
    budget:       MetabolicBudget,
    daily_mes:    float,
) -> MEAScore:
    """
    Computes the Metabolic Energy Adequacy (MEA) score.
    
    Weights:
      - Caloric Adequacy: 40%
      - Macro Balance:    35%
      - Daily MES:        25%
    """
    consumed_kcal = float(daily_totals.get("calories", 0))

    ca  = calc_caloric_adequacy(consumed_kcal, budget.tdee)
    mbs = calc_macro_balance(daily_totals, budget)

    mea = round(0.40 * ca + 0.35 * mbs + 0.25 * daily_mes, 1)
    tier = score_to_tier(mea, budget.tier_thresholds)
    meta = TIER_META[tier]

    return MEAScore(
        caloric_adequacy   = round(ca,  1),
        macro_balance      = round(mbs, 1),
        daily_mes          = daily_mes,
        mea_score          = mea,
        energy_prediction  = meta["label"],
        energy_description = meta["energy"],
        tier               = tier,
    )
```

---

## 12. Treat Impact — Keep With Adjustments

The existing `_compute_treat_impact` logic is sound. Make the following targeted adjustments only:

**a) Update protection formula weights to match new scoring weights:**

```python
# Old
protection = 0.45 * protein_coverage + 0.35 * fiber_coverage + 0.20 * carb_headroom_coverage

# New (align with actual scoring weights)
protection = 0.40 * protein_coverage + 0.30 * fiber_coverage + 0.30 * carb_headroom_coverage
```

**b) Use `budget.carb_ceiling_g` instead of any hardcoded `sugar_ceiling_g = 200`:**

```python
# Replace any reference to hardcoded 200 or sugar_ceiling_g with:
budget.carb_ceiling_g
```

**c) Adjust max penalty slightly upward since base scores are now honest (no +10 inflation):**

```python
# Old
mes_penalty_points = min(12, net_treat_load_g * 0.35)

# New
mes_penalty_points = min(15, net_treat_load_g * 0.40)
```

Everything else in treat impact (`treat_load_g`, `protection_buffer_g`, impact labels) stays the same.

---

## 13. Onboarding & Settings Integration

The `MetabolicProfile` fields must be populated from two places: **onboarding** (first run) and **settings** (editable at any time). This section defines the data contract and what needs to be built on both backend and frontend.

---

### DB Schema — `user_metabolic_settings` table

Create this table. It is a 1:1 extension of the `users` table.

```sql
CREATE TABLE user_metabolic_settings (
    user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Step 1: Required biometrics (collected at onboarding)
    weight_kg           NUMERIC(5,2)    NOT NULL,
    height_cm           NUMERIC(5,1)    NOT NULL,
    age                 SMALLINT        NOT NULL,
    sex                 VARCHAR(10)     NOT NULL,   -- 'male' | 'female'
    activity_level      VARCHAR(20)     NOT NULL DEFAULT 'moderate',
    goal                VARCHAR(30)     NOT NULL DEFAULT 'maintenance',

    -- Step 2: Enhanced (collected at onboarding step 2 or skipped)
    body_fat_pct        NUMERIC(4,1),              -- nullable if not provided
    body_fat_method     VARCHAR(30),               -- 'dexa' | 'estimate' | 'visual'

    -- Step 3: Health flags (collected at onboarding step 3 or skipped)
    insulin_resistant   BOOLEAN         NOT NULL DEFAULT FALSE,
    prediabetes         BOOLEAN         NOT NULL DEFAULT FALSE,
    type_2_diabetes     BOOLEAN         NOT NULL DEFAULT FALSE,

    -- Phase 2: Lab values (optional, user-entered)
    fasting_glucose_mgdl  NUMERIC(5,1),
    hba1c_pct             NUMERIC(4,2),
    triglycerides_mgdl    NUMERIC(5,1),

    -- Metadata
    onboarding_step_completed  SMALLINT  NOT NULL DEFAULT 0,  -- 0, 1, 2, or 3
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
);
```

---

### Onboarding Flow — 3 Steps

The frontend should present onboarding as a progressive flow. Steps 2 and 3 can be skipped — the engine will use safe defaults until they are completed.

#### Step 1 — Required (gates app access)

| Field | UI Element | Notes |
|---|---|---|
| `weight_kg` | Number input + unit toggle (kg/lbs) | Convert lbs → kg on save |
| `height_cm` | Number input + unit toggle (cm/ft-in) | Convert ft/in → cm on save |
| `age` | Number input | |
| `sex` | Radio: Male / Female | Used for BF% thresholds and BMR |
| `activity_level` | 4-option selector (see labels below) | |
| `goal` | 4-option selector (see labels below) | |

Activity level UI labels (map to enum values):
```
"Mostly sedentary"    → sedentary
"Lightly active"      → moderate
"Regularly active"    → active
"Athlete / daily training" → athletic
```

Goal UI labels:
```
"Lose body fat"           → fat_loss
"Build muscle"            → muscle_gain
"Maintain & optimize"     → maintenance
"Metabolic reset / health" → metabolic_reset
```

#### Step 2 — Enhanced (optional, shown after Step 1 completes)

| Field | UI Element | Notes |
|---|---|---|
| `body_fat_pct` | Number input | Show "Not sure?" link → visual estimator |
| `body_fat_method` | Hidden, set automatically | `'estimate'` if user typed, `'dexa'` if they confirm lab-measured |

> If skipped: `body_fat_pct = null`. The ISM defaults to 1.0 (neutral). Show a prompt in settings to complete it later.

#### Step 3 — Health context (optional, shown after Step 2 or skippable)

| Field | UI Element | Notes |
|---|---|---|
| `insulin_resistant` | Toggle | Label: "I have insulin resistance" |
| `prediabetes` | Toggle | Label: "I have prediabetes" |
| `type_2_diabetes` | Toggle | Label: "I have Type 2 diabetes" |

> These are self-reported flags, not medical diagnoses. Add a brief disclaimer: *"Used only to personalize your metabolic scoring."*

> If all three are false (default): neutral scoring. If `type_2_diabetes = true`, auto-set `insulin_resistant = true` as well.

---

### Settings Page — Editable Fields

All `user_metabolic_settings` fields must be editable from the user's settings page. Group them into logical sections:

#### "Body & Activity" section
- Weight, height, age, sex
- Activity level (dropdown)
- Goal (dropdown)

#### "Body Composition" section
- Body fat % (with "How to measure" tooltip)
- Shows current ISM and its effect: *"Your metabolic scoring is currently [X% stricter / more lenient] based on this value."*

#### "Health Profile" section
- Insulin resistance toggle
- Prediabetes toggle
- Type 2 diabetes toggle
- Lab values (fasting glucose, HbA1c, triglycerides) — Phase 2, show as "Coming soon" placeholders

---

### Backend Endpoints Required

Add these endpoints in a new router: `backend/app/routers/metabolic_profile.py`

```
POST   /api/profile/metabolic          — Create (called at end of onboarding Step 1)
GET    /api/profile/metabolic          — Read current profile
PATCH  /api/profile/metabolic          — Update any fields (called from settings)
GET    /api/profile/metabolic/budget   — Returns the computed MetabolicBudget for the
                                         current user (for frontend debug/display)
```

`PATCH` should accept partial updates — only fields provided are updated. Always recalculate and invalidate the cached `MetabolicBudget` on any change.

---

### Profile Loading in the Engine

Every call to `compute_meal_mes`, `compute_daily_mes`, and `compute_mea_score` must go through a `MetabolicBudget`. The budget must be loaded from the user's profile, not hardcoded. Add this helper in `metabolic_engine.py`:

```python
def load_budget_for_user(user_id: str, db) -> MetabolicBudget:
    """
    Loads user_metabolic_settings from DB and builds MetabolicBudget.
    Falls back to DEFAULT_PROFILE if no settings exist yet
    (e.g. user hasn't completed onboarding).
    """
    settings = db.query(UserMetabolicSettings).filter_by(user_id=user_id).first()
    if not settings:
        return build_metabolic_budget(DEFAULT_PROFILE)

    profile = MetabolicProfile(
        weight_kg          = float(settings.weight_kg),
        height_cm          = float(settings.height_cm),
        age                = settings.age,
        sex                = settings.sex,
        body_fat_pct       = float(settings.body_fat_pct) if settings.body_fat_pct else None,
        activity_level     = ActivityLevel(settings.activity_level),
        goal               = Goal(settings.goal),
        insulin_resistant  = settings.insulin_resistant,
        prediabetes        = settings.prediabetes,
        type_2_diabetes    = settings.type_2_diabetes,
        fasting_glucose_mgdl  = float(settings.fasting_glucose_mgdl) if settings.fasting_glucose_mgdl else None,
        hba1c_pct             = float(settings.hba1c_pct) if settings.hba1c_pct else None,
        triglycerides_mgdl    = float(settings.triglycerides_mgdl) if settings.triglycerides_mgdl else None,
    )
    return build_metabolic_budget(profile)
```

---

### Include Threshold Info in Budget API Response

When returning `GET /api/profile/metabolic/budget`, include the computed thresholds so the frontend can display contextual messaging:

```json
{
  "tdee": 2340,
  "protein_g": 128,
  "carb_ceiling_g": 110,
  "fiber_g": 32,
  "fat_g": 98,
  "ism": 1.25,
  "tier_thresholds": {
    "optimal": 93,
    "good": 78,
    "moderate": 63,
    "low": 48
  },
  "threshold_context": {
    "shift": 8,
    "reason": "Insulin resistance detected — thresholds adjusted for your metabolic risk profile.",
    "leniency": "stricter"
  }
}
```

Add this helper to generate `threshold_context`:

```python
def describe_threshold_shift(profile: MetabolicProfile) -> dict:
    thresholds = calc_tier_thresholds(profile)
    shift = thresholds["optimal"] - BASE_TIER_THRESHOLDS["optimal"]

    if shift > 0:
        leniency = "stricter"
        if profile.type_2_diabetes:
            reason = "Type 2 diabetes detected — thresholds adjusted for your metabolic risk profile."
        elif profile.insulin_resistant:
            reason = "Insulin resistance detected — thresholds adjusted for your metabolic risk profile."
        elif profile.prediabetes:
            reason = "Prediabetes detected — thresholds adjusted for your metabolic risk profile."
        else:
            reason = "Your body composition indicates tighter metabolic margins."
    elif shift < 0:
        leniency = "lenient"
        reason = "Your fitness level and body composition give you more metabolic flexibility."
    else:
        leniency = "neutral"
        reason = "Standard scoring thresholds applied."

    return {"shift": shift, "reason": reason, "leniency": leniency}
```

---

## 14. API Response Shape Changes

### `/api/metabolic/score/meals` — Add fields

```json
{
  "meal_mes": 72.4,
  "tier": "good",
  "sub_scores": {
    "gis": 68.0,
    "pas": 85.2,
    "fs": 71.0,
    "fas": 78.5
  },
  "net_carbs_g": 22.5,
  "weights_used": {
    "gis": 0.35,
    "protein": 0.30,
    "fiber": 0.20,
    "fat": 0.15
  }
}
```

### `/api/metabolic/score/daily` — Add MEA block

```json
{
  "score": {
    "daily_mes": 74.1,
    "tier": "good",
    "sub_scores": { "gis": 71.0, "pas": 82.0, "fs": 68.0, "fas": 75.0 },
    "treat_impact": { ... }
  },
  "mea": {
    "mea_score": 78.3,
    "caloric_adequacy": 91.0,
    "macro_balance": 74.5,
    "daily_mes": 74.1,
    "energy_prediction": "Good",
    "energy_description": "Good energy, minor dips possible",
    "tier": "good"
  },
  "remaining": { ... }
}
```

> **Important:** Keep the existing `remaining` budget response shape unchanged. Only add the `mea` block and expand `score` sub-scores. Do not remove any existing response keys.

---

## 15. Migration & Compatibility Notes

| Item | Action |
|---|---|
| `sugar_ceiling_g` in DB / stored JSON | Keep as alias — read it but write `carb_ceiling_g` going forward |
| `sugar_g` nutrient key | Keep as fallback read alias for `carbs_g` — do not remove |
| Existing `metabolic_scores` rows | Old scores stay as-is; new scores will naturally differ — do not backfill |
| `display_mes` field (if exists in DB or response) | Set equal to `raw_mes` (remove the +10). Do not delete the field from DB schema. |
| `unscored` items (dessert, sauce, components) | No change — keep existing behavior exactly |
| `recompute_daily_score()` | Update to pass `MetabolicBudget` from user profile; if profile not found, use `DEFAULT_PROFILE` |

---

## 16. Testing Checklist

After implementation, verify all of the following manually or with unit tests:

### Sub-score sanity checks

```python
assert calc_gis(0)   == 100.0
assert calc_gis(10)  == 100.0
assert calc_gis(20)  == 80.0
assert calc_gis(35)  == 55.0
assert calc_gis(55)  == 25.0
assert calc_gis(80)  == 5.0
assert calc_gis(100) == 0.0

assert calc_pas(0,   35) == 0.0
assert calc_pas(35,  35) == 100.0
assert calc_pas(17.5,35) == 70.0  # 50% of target

assert calc_fs(0)  == 0.0
assert calc_fs(10) == 90.0
assert calc_fs(20) == 100.0

assert calc_fas(0)  == 0.0
assert calc_fas(25) > 80.0
assert calc_fas(100) < 60.0
```

### Score weights sum to 1.0

```python
budget = build_metabolic_budget(DEFAULT_PROFILE)
w = budget.weights
assert abs(w.gis + w.protein + w.fiber + w.fat - 1.0) < 0.001
```

### ISM modifiers directionally correct

```python
lean_profile   = MetabolicProfile(weight_kg=70, height_cm=175, age=28, sex="male", body_fat_pct=12)
obese_profile  = MetabolicProfile(weight_kg=100, height_cm=175, age=40, sex="male", body_fat_pct=32)
ir_profile     = MetabolicProfile(weight_kg=90, height_cm=175, age=45, sex="male", insulin_resistant=True)

assert calc_ism(lean_profile)  < calc_ism(DEFAULT_PROFILE)
assert calc_ism(obese_profile) > calc_ism(DEFAULT_PROFILE)
assert calc_ism(ir_profile)    > calc_ism(obese_profile)
```

### Dynamic tier thresholds are directionally correct

```python
athletic_profile = MetabolicProfile(
    weight_kg=72, height_cm=178, age=26, sex="male",
    body_fat_pct=11, activity_level=ActivityLevel.ATHLETIC
)
t_athletic = calc_tier_thresholds(athletic_profile)
t_default  = calc_tier_thresholds(DEFAULT_PROFILE)
t_ir       = calc_tier_thresholds(ir_profile)
t_t2d      = calc_tier_thresholds(
    MetabolicProfile(weight_kg=90, height_cm=172, age=50, sex="male", type_2_diabetes=True)
)

# Athletic should be most lenient (lowest threshold to reach each tier)
assert t_athletic["optimal"] < t_default["optimal"]
assert t_athletic["good"]    < t_default["good"]

# IR and T2D should be strictest
assert t_ir["optimal"]  > t_default["optimal"]
assert t_t2d["optimal"] > t_ir["optimal"]

# Thresholds must stay within safety caps
for t in [t_athletic, t_default, t_ir, t_t2d]:
    assert 75 <= t["optimal"] <= 95
    assert 60 <= t["good"]    <= 82
    assert 45 <= t["moderate"] <= 68
    assert 30 <= t["low"]      <= 52
```

### Same score, different tier based on profile

```python
score = 72.0

tier_athletic = score_to_tier(score, t_athletic)
tier_default  = score_to_tier(score, t_default)
tier_ir       = score_to_tier(score, t_ir)

# Athletic user: 72 should reach 'optimal' (threshold ~77 after shift)
assert tier_athletic in ("optimal", "good")

# Default user: 72 is just above 'good' threshold (70)
assert tier_default == "good"

# IR user: 72 falls below their 'good' threshold (~78)
assert tier_ir == "moderate"
```

### Same meal, different profiles produce different scores

```python
meal = {"protein_g": 45, "carbs_g": 65, "fiber_g": 8, "fat_g": 12}

budget_lean    = build_metabolic_budget(lean_profile)
budget_ir      = build_metabolic_budget(ir_profile)

score_lean = compute_meal_mes(meal, budget_lean)["meal_mes"]
score_ir   = compute_meal_mes(meal, budget_ir)["meal_mes"]

assert score_lean > score_ir   # lean user should score higher on same carb-heavy meal
```

### No score ever exceeds 100 or goes below 0

```python
extreme_meal = {"protein_g": 200, "carbs_g": 300, "fiber_g": 0, "fat_g": 150}
result = compute_meal_mes(extreme_meal, budget_lean)
assert 0 <= result["meal_mes"] <= 100
```

### Budget carries thresholds

```python
budget = build_metabolic_budget(ir_profile)
assert "tier_thresholds" in budget.__dict__
assert budget.tier_thresholds["optimal"] > BASE_TIER_THRESHOLDS["optimal"]
```

---

*End of instructions. Implement changes in the order listed in Section 1. Commit each priority group separately for clean review.*
