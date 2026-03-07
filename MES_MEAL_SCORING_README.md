# MES Meal Scoring (Current Refactor)

Last updated: 2026-03-05

This README explains how **meal-level MES** is currently calculated in the refactored system.

Source of truth:
- `backend/app/services/metabolic_engine.py`
- `backend/app/routers/recipes.py`

## 1) What gets a meal MES score

A logged item only gets a meal MES score when its context is `full_meal`.

Contexts that **do not** get meal MES:
- `dessert`
- `sauce_condiment`
- `meal_component_protein`
- `meal_component_carb`
- `meal_component_veg`

Code path:
- `classify_meal_context(...)`
- `should_score_meal(context)` returns `True` only for `full_meal`.

For recipe records, scoreability is additionally gated by recipe flags used by app flows:
- `recipe_role == "full_meal"`
- `is_component == False`
- `is_mes_scoreable == True`

## 2) Inputs used for meal MES

`compute_meal_mes(nutrition, budget)` extracts:
- `protein_g` (fallback `protein`)
- `fiber_g` (fallback `fiber`)
- `carbs_g` (fallback `carbs`, then `sugar_g` / `sugar`)
- `fat_g` (fallback `fat`)

Derived:
- `net_carbs_g = max(0, carbs_g - fiber_g)`
- `protein_target_per_meal = daily_protein_target / 3`

## 3) Sub-score formulas (0–100)

### GIS (Glycemic Impact Score) from net carbs
- `<=10g` => `100`
- `10–20g` => linear `100 -> 80`
- `20–35g` => linear `80 -> 55`
- `35–55g` => linear `55 -> 25`
- `55–80g` => linear `25 -> 5`
- `>80g` => decays toward `0`

### PAS (Protein Adequacy Score)
Uses protein ratio `protein_g / protein_target_per_meal`:
- `>=1.0` => `100`
- `0.75–1.0` => `70..100`
- `0.5–0.75` => `40..70`
- `0.25–0.5` => `10..40`
- `<0.25` => `0..10`

### FS (Fiber Score)
- `0–2g` => `0..20`
- `2–6g` => `20..65`
- `6–10g` => `65..90`
- `10–15g` => `90..100`
- `>15g` => `100`

### FAS (Fat Adequacy Score)
Inverted-U, sweet spot around `15–40g`:
- `<5g` penalized
- `5–15g` ramps up
- `15–40g` high score
- `40–60g` mild decline
- `>60g` stronger decline (floor-protected)

## 4) Weighted meal MES composite

Raw meal MES:
- `meal_mes = w_gis*GIS + w_protein*PAS + w_fiber*FS + w_fat*FAS`
- rounded to 1 decimal

Returned compatibility keys:
- `total_score` = `meal_mes`
- `display_score` = `meal_mes` (no +10 inflation in refactor)
- `tier` and `display_tier` are identical
- legacy fields are still present (`protein_score`, `fiber_score`, `sugar_score`)

Also returned:
- `sub_scores: { gis, pas, fs, fas }`
- `weights_used: { gis, protein, fiber, fat }`

## 5) How weights and targets are personalized

Budgets are profile-derived via `build_metabolic_budget(...)`:
- protein target from weight/goal/age
- carb ceiling from insulin/metabolic + activity profile
- fiber target from bodyweight floor rule
- fat target from remaining calories

Weight logic:
- Base weights: GIS `0.35`, Protein `0.30`, Fiber `0.20`, Fat `0.15`
- GIS weight is scaled by ISM (insulin sensitivity modifier), capped at `0.50`
- Protein gets +`0.05` if goal is muscle gain
- Weights are normalized to sum to `1.0`

Tier thresholds are also personalized (`optimal/good/moderate/low`) via `calc_tier_thresholds(...)`.

## 6) Default pairing rule for meal cards

If a recipe has `needs_default_pairing = true`, card-level displayed MES is treated as:
- **meal MES + preferred default pairing impact**

Implementation behavior:
- Base meal MES stays in `nutrition_info.mes_score`.
- Composite fields stored for paired meals: `mes_score_with_default_pairing`, `mes_default_pairing_delta`, `mes_default_pairing_id`, `mes_default_pairing_title`, `mes_default_pairing_role`.

The browse/card API also exposes composite score metadata (`composite_display_score`, `card_pairing_mes_delta`) so UI can show the paired score directly.

## 7) Non-goals of meal MES

Meal MES does **not** include:
- Daily treat-penalty adjustment (that is daily MES only)
- Sauces/components/desserts as standalone scored meals

Those affect other parts of the system (daily totals, context hints), but not individual meal MES cards.
