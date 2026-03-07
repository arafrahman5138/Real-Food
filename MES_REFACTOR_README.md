# MES Refactor README

Last updated: 2026-03-05

This document summarizes the full Metabolic Energy Score (MES) refactor implemented across backend, database, API contracts, and frontend UX.

---

## 1) What this refactor delivered

- Rebuilt MES scoring around profile-aware metabolic budgets instead of one-size-fits-all defaults.
- Added richer sub-scoring (GIS / PAS / FS / FAS) and dynamic thresholds.
- Expanded onboarding/profile data model to support personalized scoring inputs.
- Updated backend API responses to expose richer score, weight, threshold, and treat-impact context.
- Refreshed Chronometer + MES UI with improved cards, guardrails, charts, coach insights, and meal/composite score surfaces.
- Added importer/classification + side-pairing workflow for recipe role quality and MES rescue.

---

## 2) Phase summary (1 → 6)

## Phase 1 — Scoring Engine Rewrite

Primary file:
- `backend/app/services/metabolic_engine.py`

Highlights:
- Core MES logic rewritten with profile-aware budget loading and derived targets.
- `recompute_daily_score` updated to use computed profile budget (not only ORM static budget values).
- `on_food_log_created` now passes computed budget into meal upsert and downstream recomputation.
- Daily scoring preserves treat impact metadata and MEA integration.

## Phase 2 — Profile + Budget Model Expansion

Primary files:
- `backend/app/models/metabolic_profile.py`
- `backend/alembic/versions/b7e2a5f31c09_mes_refactor_phase1_profile_and_budget.py`

Highlights:
- Added profile fields used by personalization/onboarding:
  - `age`, `height_ft`, `height_in`, `body_fat_method`
  - `insulin_resistant`, `prediabetes`, `type_2_diabetes`
  - `fasting_glucose_mgdl`, `hba1c_pct`, `triglycerides_mgdl`
  - `onboarding_step_completed`
- Added `weight_fat` to `metabolic_budgets`.

## Phase 3 — API + Schema Contract Alignment

Primary files:
- `backend/app/schemas/metabolic.py`
- `backend/app/routers/metabolic.py`

Highlights:
- API responses aligned to new score fields and computed budget/threshold outputs.
- Profile save/patch flows connected to target derivation + budget syncing.

## Phase 4 — Meal Context + Composition Intelligence

Primary files:
- `backend/app/services/metabolic_engine.py`
- `frontend/utils/mealContext.ts`
- `frontend/components/CompositeMealCard.tsx`
- `frontend/components/MealMESBadge.tsx`
- `frontend/components/MealScoreSheet.tsx`

Highlights:
- Meal context classification improved (`full_meal`, component types, sauce, dessert).
- Per-meal score visibility controlled by context (unscored hints for non-full-meal contexts).
- Composite meal UI/score surfaces added.

## Phase 5 — Import, Role Backfill, and Side Library

Primary files:
- `backend/import_wholefood_site_recipes.py`
- `backend/seed_side_library.py`
- `backend/scripts/backfill_recipe_roles.py`
- `backend/scripts/verify_phase_c.py`
- `backend/scripts/export_all_meals_json.py`

Highlights:
- Import pipeline upgraded with role classification and MES gate behavior.
- Curated side-library added for MES rescue/default pairings.
- Backfill tooling added for legacy recipe role correction.

## Phase 6 — Frontend Experience Upgrade

Primary files (selected):
- `frontend/stores/metabolicBudgetStore.ts`
- `frontend/app/metabolic-onboarding.tsx`
- `frontend/app/food/metabolic-coach.tsx`
- `frontend/components/EnergyBudgetCard.tsx`
- `frontend/components/GuardrailBar.tsx`
- `frontend/components/GuardrailQuad.tsx`
- `frontend/components/MetabolicCoach.tsx`
- `frontend/components/ProjectedMESCard.tsx`
- `frontend/components/NutriScoreHeroCard.tsx`
- `frontend/components/XPToast.tsx`

Highlights:
- New 3-step metabolic onboarding (U.S. units: lbs + ft/in; macros remain grams).
- Expanded MES store typings for sub-scores, weights, thresholds, MEA, and history.
- New charting/cards for daily trend, impact preview, guardrails, and coaching.

---

## 3) Critical production fix completed

Issue observed:
- `fetchBudget` and `fetchDailyScore` returned 500 after onboarding.

Root cause:
- Database was behind expected schema revision.
- Migration `b7e2a5f31c09` existed but had not been applied.
- Runtime error: missing `metabolic_profiles.age` and other new columns.

Resolution:
- Applied `alembic upgrade head` in backend.
- Verified missing columns now exist in `metabolic_profiles` and `metabolic_budgets`.
- Added robust `height_cm` derivation from `height_ft` + `height_in` in profile save/update flow.

Files updated for this follow-up fix:
- `backend/app/routers/metabolic.py`

---

## 4) Validation status

- Engine test suite executed: **33/33 passing** (from MES audit run).
- Frontend TypeScript checks for MES-touched files reported no new type errors.
- Backend endpoint health verified after migration and router fix.

---

## 5) Operational notes

- If onboarding-related 500s reappear in another environment, first verify Alembic revision is at head.
- Ensure deployment runbooks include schema migration before app traffic shift.
- Profile payloads are expected in U.S. body units (lbs, ft/in), with nutrition targets and tracking in grams.

---

## 6) Quick reference

- Refactor spec source: `MES_REFACTOR_INSTRUCTIONS (1).md`
- Scoring behavior guide: `MES_SCORING_README.md`
- QA checklist: `QA_CHECKLIST.md`
