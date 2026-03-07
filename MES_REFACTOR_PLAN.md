# MES Refactor — Implementation Plan

> **Status:** Planning  
> **Engine file:** `backend/app/services/metabolic_engine.py`  
> **Units:** U.S. (lbs, ft/in) for user-facing biometrics; grams for all macros  
> **Approach:** Phased rollout — engine first, then schema, API, frontend, onboarding

---

## Table of Contents

1. [Current Problems](#1-current-problems)
2. [Architecture Decisions](#2-architecture-decisions)
3. [Phase 1 — Engine Core Rewrite](#phase-1--engine-core-rewrite)
4. [Phase 2 — Profile Schema Extension](#phase-2--profile-schema-extension)
5. [Phase 3 — API + Frontend Types](#phase-3--api--frontend-types)
6. [Phase 4 — Chronometer UX (Sub-Score Visibility)](#phase-4--chronometer-ux-sub-score-visibility)
7. [Phase 5 — Metabolic Onboarding](#phase-5--metabolic-onboarding)
8. [Phase 6 — Dynamic Thresholds + MEA](#phase-6--dynamic-thresholds--mea)
9. [Migration & Compatibility Notes](#migration--compatibility-notes)
10. [Testing Checklist](#testing-checklist)

---

## 1. Current Problems

| Problem | Impact |
|---------|--------|
| **Sugar score cliff formula** — `100 - max(0, (ratio-1)) * 200` is flat at 100 until the 200g ceiling, then collapses. A 20g-carb meal scores identical to a 180g-carb meal. | Scoring is meaningless for differentiation |
| **200g carb ceiling** — Almost nobody hits it. The guardrail never triggers. | False sense of security |
| **`display_score = raw + 10` inflation** — A raw 65 shows as 75. Dishonest. | Erodes user trust when they realize |
| **No fat sub-score** — Fat is completely invisible to MES. | Major blind spot for meal quality |
| **3-weight system (50/25/25)** — Protein dominates, sugar/fiber are afterthoughts. | Unbalanced incentives |
| **No personalization** — Same targets for a 120 lb sedentary woman and a 220 lb athlete. | One-size-fits-none |
| **No sub-score breakdown visible in UI** — Users see one number with no understanding of why. | Zero educational value |

---

## 2. Architecture Decisions

These decisions address conflicts between the original refactor spec and the existing codebase.

### 2a. Naming: Avoid ORM Collisions

The codebase already has SQLAlchemy models named `MetabolicProfile` (in `models/metabolic_profile.py`) and `MetabolicBudget` (in `models/metabolic.py`). The new engine dataclasses will use distinct names:

| Refactor Spec Name | Actual Name (engine dataclass) | Why |
|---|---|---|
| `MetabolicProfile` | `MetabolicProfileInput` | Avoids collision with ORM `MetabolicProfile` |
| `MetabolicBudget` | `ComputedBudget` | Avoids collision with ORM `MetabolicBudget` |
| `ScoreWeights` | `ScoreWeights` | No conflict |
| `MEAScore` | `MEAScore` | No conflict |

### 2b. U.S. Units for User Input, Metric Internally

- **User-facing:** Weight in **lbs**, height in **ft/in** (with optional metric toggle)
- **Storage:** The existing `metabolic_profiles` table already has `weight_lb`. We'll add `height_ft`, `height_in` columns alongside `height_cm`. All conversions happen at the API boundary.
- **Engine internals:** Convert to metric for BMR/TDEE calculations (Mifflin-St Jeor uses kg/cm). Macros stay in **grams** everywhere.

### 2c. Extend Existing Table, Don't Create a Parallel One

The spec proposes a new `user_metabolic_settings` table, but `metabolic_profiles` already exists with overlapping fields. We'll **add columns** to `metabolic_profiles` via Alembic migration instead:

New columns to add:
- `age` (int)
- `height_ft` (int, nullable)
- `height_in` (float, nullable)
- `weight_lb` — already exists
- `insulin_resistant` (bool, default false)
- `prediabetes` (bool, default false)
- `type_2_diabetes` (bool, default false)
- `body_fat_method` (str, nullable)
- `fasting_glucose_mgdl` (float, nullable)
- `hba1c_pct` (float, nullable)
- `triglycerides_mgdl` (float, nullable)
- `onboarding_step_completed` (int, default 0)

### 2d. Backwards-Compatible API Responses

The existing frontend reads `total_score`, `display_score`, `sugar_score`, `tier`, etc. We will **not** break these keys during migration. Instead:

- Keep returning `total_score`, `display_score` (set equal to raw — no +10), `sugar_score`, `protein_score`, `fiber_score`
- **Add** new keys: `meal_mes`, `sub_scores` (with `gis`, `pas`, `fs`, `fas`), `weights_used`, `net_carbs_g`
- Frontend migrates to new keys at its own pace in Phase 3/4

### 2e. Onboarding is Additive

The existing onboarding flow collects food preferences (flavors, dietary, allergies, proteins). The new metabolic onboarding is a **separate flow** — shown as a prompt on first Chronometer visit or as a settings section, not replacing the existing onboarding.

### 2f. `calc_pas` Test Fix

The original spec asserts `calc_pas(17.5, 35) == 70.0` but the formula gives 40.0 at ratio 0.5. The correct assertion is `calc_pas(17.5, 35) == 40.0`. The spec's test is wrong — we'll use the formula as-is (it's correct) and fix the test.

---

## Phase 1 — Engine Core Rewrite

**Scope:** Rewrite `metabolic_engine.py` scoring logic. No schema changes, no API signature changes. Existing callers keep working.  
**Risk:** Low — purely internal computation changes.  
**Priority:** Critical

### 1.1 New Constants

Replace existing constants block:

```
MEALS_PER_DAY = 3

# Base weights (4 sub-scores)
BASE_WEIGHT_GIS     = 0.35   # Glycemic Impact Score (replaces sugar_score)
BASE_WEIGHT_PROTEIN = 0.30   # Protein Adequacy Score
BASE_WEIGHT_FIBER   = 0.20   # Fiber Score
BASE_WEIGHT_FAT     = 0.15   # Fat Adequacy Score (NEW)

# Carb ceiling defaults (g/day)
CARB_CEILING_DEFAULT_G  = 130   # (was 200 — way too lenient)
CARB_CEILING_IR_G       = 90    # insulin resistant / T2D
CARB_CEILING_ATHLETIC_G = 175   # high-activity users

# Protein targets (g per lb per day)
PROTEIN_RATIO_MAINTENANCE  = 0.73   # ~1.6 g/kg
PROTEIN_RATIO_FAT_LOSS     = 0.82   # ~1.8 g/kg
PROTEIN_RATIO_MUSCLE_GAIN  = 1.00   # ~2.2 g/kg
PROTEIN_RATIO_METABOLIC    = 0.82   # ~1.8 g/kg

# Fiber target
FIBER_TARGET_G_PER_LB = 0.18   # ~30g for 165 lb person
FIBER_FLOOR_MINIMUM_G = 25.0

# Tier thresholds (base — adjusted per profile in Phase 6)
TIER_OPTIMAL  = 85
TIER_GOOD     = 70
TIER_MODERATE = 55
TIER_LOW      = 40
```

### 1.2 New Sub-Score Functions

Four pure functions, each returning 0–100:

| Function | Replaces | Input | Key Change |
|----------|----------|-------|------------|
| `calc_gis(net_carbs_g)` | `sugar_score` cliff formula | Net carbs (carbs − fiber) | Linear degradation curve: 100→0 across 0–80g net carbs |
| `calc_pas(protein_g, target_g)` | `protein_score` linear cap | Protein g vs per-meal target | Smooth curve with 4 brackets, not linear |
| `calc_fs(fiber_g)` | `fiber_score` linear cap | Fiber g | Diminishing returns above 15g |
| `calc_fas(fat_g)` | *(new)* | Fat g | Inverted-U: penalizes both <5g and >60g |

### 1.3 Replace `compute_meal_mes()`

- Extract `protein_g`, `fiber_g`, `carbs_g`, `fat_g` (with legacy key fallbacks)
- Compute `net_carbs_g = max(0, carbs_g - fiber_g)`
- Call four sub-score functions
- Weighted composite: `w.gis * gis + w.protein * pas + w.fiber * fs + w.fat * fas`
- **No +10 inflation.** `display_score = raw_score` (set equal, not removed from response)
- Return both old keys (`total_score`, `protein_score`, `fiber_score`, `sugar_score`) AND new keys (`meal_mes`, `sub_scores`)

### 1.4 Replace `compute_daily_mes()`

- Same sub-score approach, normalized to per-meal equivalents for GIS/FS/FAS curves
- PAS scored against full daily protein target
- Treat impact applied after base score

### 1.5 Update Treat Impact

- Protection weights: `0.40 * protein + 0.30 * fiber + 0.30 * carb_headroom` (was 0.45/0.35/0.20)
- Use `carb_ceiling_g` (130g default) instead of hardcoded 200
- Max penalty: `min(15, net_treat_load * 0.40)` (was min 12, 0.35)

### 1.6 Remove +10 Inflation

- Delete `DISPLAY_OFFSET = 10`
- Delete `to_display_score()` function (or make it identity: return raw)
- Delete `display_tier()` function (tier derived from raw score directly)
- `display_score` field = `total_score` field (no delta)

### 1.7 Update Tier Thresholds

Old: `80 / 60 / 40 / 0` → `optimal / stable / shaky / crash_risk`  
New: `85 / 70 / 55 / 40` → `optimal / good / moderate / low / critical`

Tier names change:
| Old | New |
|-----|-----|
| `optimal` | `optimal` |
| `stable` | `good` |
| `shaky` | `moderate` |
| `crash_risk` | `low` |
| *(none)* | `critical` (below 40) |

### Files Changed (Phase 1)

- `backend/app/services/metabolic_engine.py` — full rewrite of scoring logic

---

## Phase 2 — Profile Schema Extension

**Scope:** Extend `metabolic_profiles` table. Add `build_metabolic_budget()` that reads profile to derive personalized targets.  
**Risk:** Medium — requires Alembic migration.

### 2.1 Alembic Migration

Add to `metabolic_profiles`:
```sql
ALTER TABLE metabolic_profiles ADD COLUMN age INTEGER;
ALTER TABLE metabolic_profiles ADD COLUMN height_ft INTEGER;
ALTER TABLE metabolic_profiles ADD COLUMN height_in FLOAT;
ALTER TABLE metabolic_profiles ADD COLUMN insulin_resistant BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metabolic_profiles ADD COLUMN prediabetes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metabolic_profiles ADD COLUMN type_2_diabetes BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metabolic_profiles ADD COLUMN body_fat_method VARCHAR(30);
ALTER TABLE metabolic_profiles ADD COLUMN fasting_glucose_mgdl FLOAT;
ALTER TABLE metabolic_profiles ADD COLUMN hba1c_pct FLOAT;
ALTER TABLE metabolic_profiles ADD COLUMN triglycerides_mgdl FLOAT;
ALTER TABLE metabolic_profiles ADD COLUMN onboarding_step_completed SMALLINT NOT NULL DEFAULT 0;
```

### 2.2 Engine Dataclasses

Add to `metabolic_engine.py`:

- `Goal` enum: `fat_loss`, `muscle_gain`, `maintenance`, `metabolic_reset`
- `ActivityLevel` enum: `sedentary`, `moderate`, `active`, `athletic`
- `MetabolicProfileInput` dataclass (required: `weight_lb`, `height_ft`, `height_in`, `age`, `sex`)
- `ScoreWeights` dataclass with `.normalized()` method
- `ComputedBudget` dataclass (tdee, protein_g, carb_ceiling_g, fiber_g, fat_g, weights, ism)

### 2.3 Helper Functions

| Function | Purpose |
|----------|---------|
| `calc_tdee(profile)` | Mifflin-St Jeor BMR × activity multiplier. Converts lbs→kg, ft/in→cm internally. |
| `calc_protein_target_g(profile)` | `weight_lb × ratio` (with age bonus for 40+ and 50+) |
| `calc_carb_ceiling_g(profile)` | Dynamic: 130g default, 90g for IR/T2D, 175g for athletic |
| `calc_fat_target_g(tdee, carb_g, protein_g)` | Fills remaining calories, floor of 40g |
| `calc_ism(profile)` | Insulin Sensitivity Modifier: 0.85 (lean) → 1.35 (T2D) |
| `build_metabolic_budget(profile)` | Orchestrates all of the above into a `ComputedBudget` |
| `load_budget_for_user(user_id, db)` | Reads DB profile → `MetabolicProfileInput` → `build_metabolic_budget()`. Falls back to `DEFAULT_PROFILE` if no profile exists. |

### 2.4 Default Profile (U.S. Units)

```python
DEFAULT_PROFILE = MetabolicProfileInput(
    weight_lb=165,
    height_ft=5,
    height_in=7,
    age=30,
    sex="male",
    activity_level=ActivityLevel.MODERATE,
    goal=Goal.MAINTENANCE,
)
```

### Files Changed (Phase 2)

- `backend/app/models/metabolic_profile.py` — add columns
- `backend/alembic/versions/xxx_extend_metabolic_profiles.py` — migration
- `backend/app/services/metabolic_engine.py` — add dataclasses, helpers, budget builder
- `backend/app/schemas/metabolic.py` — extend `MetabolicProfileCreate` / `MetabolicProfileResponse`

---

## Phase 3 — API + Frontend Types

**Scope:** Add `sub_scores` to API responses alongside existing keys. Update frontend types and store.  
**Risk:** Medium — touches API responses and store types.

### 3.1 Backend — Response Shape Additions

**`/api/metabolic/score/meals`** — add fields:
```json
{
  "total_score": 72.4,
  "display_score": 72.4,
  "protein_score": 85.2,
  "fiber_score": 71.0,
  "sugar_score": 68.0,
  "tier": "good",
  "meal_mes": 72.4,
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

**`/api/metabolic/score/daily`** — add MEA block (Phase 6), add `sub_scores` to score object.

All existing keys (`total_score`, `display_score`, `protein_score`, `fiber_score`, `sugar_score`, `tier`, `protein_g`, `fiber_g`, `sugar_g`, `carbs_g`) remain for backward compat.

### 3.2 Frontend — Type Updates

Update `MESScore` in `metabolicBudgetStore.ts`:
```typescript
export interface MESScore {
  // Existing (kept for compat)
  protein_score: number;
  fiber_score: number;
  sugar_score: number;
  total_score: number;
  display_score: number;
  tier: string;
  display_tier: string;
  protein_g: number;
  fiber_g: number;
  sugar_g: number;
  carbs_g?: number;

  // New
  meal_mes?: number;
  sub_scores?: {
    gis: number;
    pas: number;
    fs: number;
    fas: number;
  };
  net_carbs_g?: number;
  weights_used?: {
    gis: number;
    protein: number;
    fiber: number;
    fat: number;
  };
}
```

Update `MetabolicBudget` type:
```typescript
export interface MetabolicBudget {
  protein_target_g: number;
  fiber_floor_g: number;
  sugar_ceiling_g: number;   // kept as alias
  carb_ceiling_g: number;    // new canonical name
  fat_target_g: number;      // new
  weight_protein: number;
  weight_fiber: number;
  weight_sugar: number;      // kept as alias
  weight_gis: number;        // new
  weight_fat: number;        // new
  tdee?: number;             // new
  ism?: number;              // new
}
```

### 3.3 Update Tier Config

```typescript
export const TIER_CONFIG = {
  critical: { label: 'Critical', color: '#DC2626', icon: 'alert-circle' },
  low:      { label: 'Low Energy', color: '#FF4444', icon: 'battery-dead' },
  moderate: { label: 'Moderate', color: '#FF9500', icon: 'battery-half' },
  good:     { label: 'Good', color: '#4A90D9', icon: 'battery-charging' },
  optimal:  { label: 'Optimal', color: '#34C759', icon: 'battery-full' },
  // Legacy aliases
  crash_risk: { label: 'Low Energy', color: '#FF4444', icon: 'battery-dead' },
  shaky:      { label: 'Moderate', color: '#FF9500', icon: 'battery-half' },
  stable:     { label: 'Good', color: '#4A90D9', icon: 'battery-charging' },
};
```

### Files Changed (Phase 3)

- `backend/app/schemas/metabolic.py` — add optional fields to `MESScoreResponse`
- `backend/app/routers/metabolic.py` — pass new keys through
- `frontend/stores/metabolicBudgetStore.ts` — extend types and tier config
- `frontend/components/MetabolicRing.tsx` — handle new tier names
- `frontend/components/MealMESBadge.tsx` — handle new tier names

---

## Phase 4 — Chronometer UX (Sub-Score Visibility)

**Scope:** New UI components to make sub-scores visible and educational.  
**Risk:** Low — purely additive frontend work.

### 4.1 Score Breakdown in `EnergyBudgetCard`

Add an expandable "Score Breakdown" section below the `GuardrailTrio`:

```
[▼ Score Breakdown]

GIS  (Glycemic Impact)    ████████░░  68 / 100   × 0.35
PAS  (Protein)            ██████████  85 / 100   × 0.30
FS   (Fiber)              ███████░░░  71 / 100   × 0.20
FAS  (Fat)                ████████░░  79 / 100   × 0.15
                                              ─────────
                          Weighted MES:          72.4
```

Each row shows:
- Sub-score abbreviation + full name
- Progress bar colored by score range
- Score value / 100
- Weight multiplier

### 4.2 Four-Guardrail Layout

Replace `GuardrailTrio` with `GuardrailQuad`:

| Guardrail | Type | Target Source |
|-----------|------|--------------|
| Protein | Floor (higher = better) | `budget.protein_target_g` |
| Fat | Range (sweet spot) | `budget.fat_target_g` |
| Fiber | Floor (higher = better) | `budget.fiber_floor_g` |
| Carbs | Ceiling (lower = better) | `budget.carb_ceiling_g` (130g, not 200g) |

### 4.3 Per-Meal Sub-Score Bottom Sheet

When tapping a `MealMESBadge` on the chronometer meal list, show a bottom sheet:

```
┌─────────────────────────────────────┐
│  Greek Chicken Sheet Pan            │
│  MES: 78    🟡 Good                │
│                                     │
│  ┌─ Sub-Scores ──────────────────┐  │
│  │ GIS  ██████████░░   72        │  │
│  │ PAS  ████████████   92        │  │
│  │ FS   ██████░░░░░░   58        │  │
│  │ FAS  █████████░░░   84        │  │
│  └───────────────────────────────┘  │
│                                     │
│  Net Carbs: 28g                     │
│  Protein: 42g / 40g target          │
│  Fiber: 6g    Fat: 22g             │
│                                     │
│  Weights: GIS 35% · P 30%          │
│           F 20% · Fat 15%          │
└─────────────────────────────────────┘
```

### 4.4 Remaining Budget — Add Fat

Current remaining budget shows: `protein_remaining_g`, `fiber_remaining_g`, `carb_headroom_g`.  
Add: `fat_remaining_g`.

Show in `EnergyBudgetCard` stat pills: "22g fat left" alongside existing pills.

### Files Changed (Phase 4)

- `frontend/components/EnergyBudgetCard.tsx` — add expandable breakdown
- `frontend/components/GuardrailTrio.tsx` → rename to `GuardrailQuad.tsx`, add fat bar
- `frontend/components/MealMESBadge.tsx` — add onPress → bottom sheet
- `frontend/components/ScoreBreakdown.tsx` — new component
- `frontend/components/MealScoreSheet.tsx` — new bottom sheet component
- `frontend/app/(tabs)/chronometer.tsx` — wire up new components

---

## Phase 5 — Metabolic Onboarding

**Scope:** 3-step metabolic profile collection. Separate from existing food-preference onboarding.  
**Risk:** Medium — new screens, new API endpoints.

### 5.1 When It Triggers

- **First Chronometer visit** with no metabolic profile → show prompt card: "Personalize your metabolic scoring"
- Also accessible from **Settings > Metabolic Profile**
- Does **not** replace the existing food preference onboarding

### 5.2 Step 1 — Body & Goals (Required)

| Field | UI Element | Storage | Notes |
|---|---|---|---|
| Weight | Number input (lbs) | `weight_lb` | Show "lbs" label, convert to kg only in engine |
| Height | Two inputs (ft + in) | `height_ft`, `height_in` | e.g. 5 ft 7 in |
| Age | Number input | `age` | |
| Sex | Radio: Male / Female | `sex` | Used for BF% thresholds and BMR |
| Activity Level | 4-option selector | `activity_level` | |
| Goal | 4-option selector | `goal` | |

Activity level labels:
```
"Mostly sedentary"          → sedentary
"Lightly active"            → moderate
"Regularly active"          → active
"Athlete / daily training"  → athletic
```

Goal labels:
```
"Lose body fat"              → fat_loss
"Build muscle"               → muscle_gain
"Maintain & optimize"        → maintenance
"Metabolic reset / health"   → metabolic_reset
```

### 5.3 Step 2 — Body Composition (Optional, skippable)

| Field | UI Element | Notes |
|---|---|---|
| Body fat % | Number input | Show "Not sure?" link → visual estimator or skip |
| Body fat method | Auto-set | `'estimate'` if typed, `'dexa'` if confirmed lab |

If skipped: ISM defaults to 1.0 (neutral). Prompt in settings to complete later.

### 5.4 Step 3 — Health Context (Optional, skippable)

| Field | UI Element | Notes |
|---|---|---|
| Insulin resistant | Toggle | "I have insulin resistance" |
| Prediabetes | Toggle | "I have prediabetes" |
| Type 2 diabetes | Toggle | "I have Type 2 diabetes" |

Disclaimer: *"Self-reported — used only to personalize scoring."*  
If `type_2_diabetes = true`, auto-set `insulin_resistant = true`.

### 5.5 Backend Endpoints

New router: `backend/app/routers/metabolic_profile.py`

```
POST   /api/profile/metabolic          — Save/create (Step 1 completion)
GET    /api/profile/metabolic          — Read current profile
PATCH  /api/profile/metabolic          — Partial update (settings page)
GET    /api/profile/metabolic/budget   — Returns computed budget for current user
```

### 5.6 Settings Page Integration

Add sections to existing settings page:

**"Body & Activity"** — Weight (lbs), Height (ft/in), Age, Sex, Activity level, Goal  
**"Body Composition"** — Body fat % + ISM effect text  
**"Health Profile"** — IR/prediabetes/T2D toggles + Phase 2 lab value placeholders

### Files Changed (Phase 5)

- `frontend/app/metabolic-onboarding.tsx` — new 3-step screen
- `frontend/app/(tabs)/chronometer.tsx` — add prompt card when no profile
- `frontend/app/settings.tsx` — add metabolic profile sections
- `backend/app/routers/metabolic_profile.py` — new router
- `backend/app/schemas/metabolic.py` — add onboarding schemas
- `backend/app/main.py` — register new router

---

## Phase 6 — Dynamic Thresholds + MEA

**Scope:** ISM-adjusted weights, profile-based tier thresholds, MEA score.  
**Risk:** Low — additive after profile exists.

### 6.1 Dynamic Tier Thresholds

Same raw score → different tier depending on metabolic fitness:

| Profile | Shift | Optimal at | Good at | Score 72 → |
|---|---|---|---|---|
| Athletic, 11% BF male | −8 | 77 | 62 | Optimal |
| Moderate, avg BF | 0 | 85 | 70 | Good |
| Sedentary, 28% BF | +4 | 89 | 74 | Moderate |
| Insulin resistant | +8 | 93 | 78 | Moderate |
| Type 2 diabetic | +10 | 95 | 80 | Moderate |

Safety caps:
- Optimal: 75–95
- Good: 60–82
- Moderate: 45–68
- Low: 30–52

### 6.2 MEA Score (Metabolic Energy Adequacy)

Sits above daily MES. Weights:
- Caloric Adequacy: 40% — how close consumed kcal are to TDEE
- Macro Balance: 35% — protein/carb/fat distribution vs targets
- Daily MES: 25%

Returns: `mea_score` (0–100), `caloric_adequacy`, `macro_balance`, `energy_prediction`, `tier`.

### 6.3 Budget API Response with Threshold Context

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

### Files Changed (Phase 6)

- `backend/app/services/metabolic_engine.py` — `calc_tier_thresholds()`, `compute_mea_score()`, update `score_to_tier()` to accept thresholds
- `backend/app/routers/metabolic.py` — return MEA in daily score, thresholds in budget
- `backend/app/schemas/metabolic.py` — MEA response schema
- `frontend/stores/metabolicBudgetStore.ts` — MEA types
- `frontend/components/EnergyBudgetCard.tsx` — optional MEA secondary ring

---

## Migration & Compatibility Notes

| Item | Action |
|---|---|
| `sugar_ceiling_g` in DB / stored JSON | Keep as alias — read it, but write `carb_ceiling_g` going forward |
| `sugar_g` nutrient key | Keep as fallback read alias for `carbs_g` — do not remove |
| Existing `metabolic_scores` rows | Old scores stay as-is; new scores will naturally differ — do not backfill |
| `display_score` field in DB | Set equal to `total_score` (no +10). Do not delete column. |
| `display_tier` field in DB | Set equal to `tier`. Do not delete column. |
| `to_display_score()` function | Make identity (`return raw`) or inline. Remove `DISPLAY_OFFSET`. |
| `unscored` items (dessert, sauce, components) | No change — keep existing behavior exactly |
| `recompute_daily_score()` | Update to load `ComputedBudget` from user profile; fallback to `DEFAULT_PROFILE` |
| Old tier names (`stable`, `shaky`, `crash_risk`) | Keep as aliases in frontend `TIER_CONFIG` for old stored scores |
| `weight_lb` → `weight_kg` conversion | Engine converts internally: `weight_kg = weight_lb * 0.4536` |
| `height_ft`/`height_in` → `height_cm` conversion | Engine converts internally: `height_cm = (height_ft * 12 + height_in) * 2.54` |

---

## Testing Checklist

### Sub-Score Sanity

```
calc_gis(0)   == 100     # No carbs → perfect GIS
calc_gis(10)  == 100     # ≤10g → still perfect
calc_gis(20)  == 80      # light carbs
calc_gis(35)  == 55      # moderate
calc_gis(55)  == 25      # heavy
calc_gis(80)  == 5       # near zero
calc_gis(100) == 0       # overloaded

calc_pas(0, 35)    == 0      # no protein
calc_pas(35, 35)   == 100    # hit target
calc_pas(17.5, 35) == 40     # 50% of target → 40 (mid-bracket)

calc_fs(0)  == 0
calc_fs(10) == 90
calc_fs(20) == 100

calc_fas(0)   == 0
calc_fas(25)  > 80    # sweet spot
calc_fas(100) < 60    # excessive
```

### Weights Sum to 1.0

```
budget = build_metabolic_budget(DEFAULT_PROFILE)
w = budget.weights
abs(w.gis + w.protein + w.fiber + w.fat - 1.0) < 0.001
```

### ISM Directionally Correct

```
calc_ism(lean)   < calc_ism(default) < calc_ism(obese) < calc_ism(insulin_resistant)
```

### No Score Exceeds 0–100 Range

```
Any meal input → 0 <= meal_mes <= 100
```

### Same Meal, Different Profiles

```
carb_heavy_meal = {protein_g: 45, carbs_g: 65, fiber_g: 8, fat_g: 12}
score_lean_user > score_ir_user   # IR user penalized harder on carbs via ISM
```

### Budget Carries Thresholds (Phase 6)

```
budget = build_metabolic_budget(ir_profile)
budget.tier_thresholds["optimal"] > BASE_TIER_THRESHOLDS["optimal"]
```

---

## Summary

| Phase | What | Files Touched | Blocking? |
|-------|------|--------------|-----------|
| **1** | Engine core: new sub-scores, weights, GIS, remove +10 | `metabolic_engine.py` | No — backward compat |
| **2** | Profile schema: add columns, budget builder, unit conversion | `metabolic_profile.py`, migration, engine | Phase 1 |
| **3** | API + frontend types: add `sub_scores` to responses, update store | schemas, router, store, components | Phase 1 |
| **4** | Chronometer UX: score breakdown, 4 guardrails, meal detail sheet | 6 frontend files | Phase 3 |
| **5** | Metabolic onboarding: 3-step flow (U.S. units), settings | new screens, new router | Phase 2 |
| **6** | Dynamic thresholds, MEA score | engine, router, store | Phase 2+5 |
