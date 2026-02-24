# CHRONOMETER_PLAN.md

## Feature Goal
Build a daily nutrition intelligence feature (Chronometer) that helps users track intake, compare against targets, and get actionable guidance.

## User Promise
"Know exactly what you ate today, how it compares to recommended values, and what to eat next."

---

## MVP Scope

### 1) Daily Nutrition Dashboard
- Calories consumed vs target
- Macros: protein, carbs, fat, fiber
- Micronutrients (comprehensive):
  - **Vitamins**: A, C, D, E, K, B1 (Thiamin), B2 (Riboflavin), B3 (Niacin), B5 (Pantothenic Acid), B6 (Pyridoxine), B7 (Biotin), B9 (Folate), B12 (Cobalamin)
  - **Minerals**: Calcium, Iron, Magnesium, Phosphorus, Potassium, Sodium, Zinc, Copper, Manganese, Selenium, Chromium, Iodine
  - **Essential Fatty Acids**: Omega-3 (EPA+DHA), Omega-6 (Linoleic Acid)
  - **Other**: Choline
- % Daily Value indicators
- Status badges: On Track / Low / High

### 2) Meal Logging Paths
1. Manual add
   - Search food + serving amount
2. Add from Browse recipe
   - "Log meal" from recipe details
3. Add from Meal Plan
   - One-tap log from planned meal card
4. Add from Cook Mode
   - "Mark cooked & log" CTA

### 3) Daily Timeline
- Logs grouped by breakfast/lunch/dinner/snacks
- Edit or delete entries
- Duplicate previous meal (quick-add)

---

## Unique Ideas (Included)

### Idea 1 — Nutrition Gap Coach
- Detect nutrient shortfalls in real-time/day-end
- Show "You’re low on X" + 2-3 food/recipe suggestions to close gaps

### Idea 2 — Daily Target Score (0–100)
- Composite score from:
  - Macro alignment
  - Micronutrient coverage
  - Optional processed-food penalty (phase 2)
- Enables simple daily progress and gamification tie-in

### Idea 3 — "What To Eat Next"
- Smart context suggestions from current day totals
- Examples:
  - "Need +30g protein with low calories"
  - "Need potassium without extra sodium"

### Idea 4 — Chronometer Streak
- New streak type for nutrition adherence
- Example rule: score >=80 for 5 straight days
- XP + badge rewards

---

## Data Model (Backend)

### `nutrition_targets`
- `id`, `user_id`
- `calories_target`
- `protein_g_target`, `carbs_g_target`, `fat_g_target`, `fiber_g_target`
- micronutrient targets (JSON or explicit columns)
- `created_at`, `updated_at`

### `food_logs`
- `id`, `user_id`, `date`, `meal_type`
- `source_type` enum: `manual|recipe|meal_plan|cook_mode`
- `source_id` nullable
- `quantity`, `servings`
- `nutrition_snapshot` JSON (immutable nutrition at log time)
- `created_at`, `updated_at`

### `daily_nutrition_summary`
- `id`, `user_id`, `date`
- `totals_json`
- `comparison_json` (% target + low/high flags)
- `daily_score`
- `created_at`, `updated_at`

---

## API Plan

### Targets
- `GET /nutrition/targets`
- `PUT /nutrition/targets`

### Logs
- `POST /nutrition/logs`
- `GET /nutrition/logs?date=YYYY-MM-DD`
- `PATCH /nutrition/logs/{id}`
- `DELETE /nutrition/logs/{id}`

### Daily Summary
- `GET /nutrition/daily?date=YYYY-MM-DD`

### Smart Guidance (Phase 2)
- `GET /nutrition/gaps?date=YYYY-MM-DD`
- `GET /nutrition/next-meal-suggestions?date=YYYY-MM-DD`

---

## Frontend Plan

### New Chronometer Screen
- Date picker (today default)
- Daily score card
- Macro cards/rings
- Micronutrient progress list (%DV)
- Meal log timeline + add button

### Integrations
- Browse recipe details: add "Log Meal"
- Meal Plan card: add "Log Meal"
- Cook Mode completion: add "Cooked + Log"

### Reusable Components
- `DailyScoreCard`
- `MacroProgress`
- `MicroNutrientList`
- `MealLogTimeline`
- `LogMealSheet`

---

## Rollout (2 Sprints)

### Sprint 1 — Foundation (P0)
- Schema + migrations
- Core API for targets/logs/daily summary
- Manual logging UI
- Dashboard with calories + macros

### Sprint 2 — Intelligence + Retention (P1)
- Recipe/plan/cook integrations
- Micronutrient %DV panel
- Gap Coach
- What To Eat Next
- Chronometer streak + XP integration

---

## Success Metrics
- % DAU logging >=1 meal/day
- Avg logs/user/day
- D7 retention uplift for loggers vs non-loggers
- % users hitting target score >=80 at least 3 days/week
