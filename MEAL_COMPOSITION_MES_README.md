# Meal Composition + MES System Plan

## Purpose
This document defines the implementation plan for handling **two meal modes** in Real-Food:

1. **Composed meals** (single, complete meal cards for sit-down flow)
2. **Decoupled meal-prep components** (protein/carb/veg/sauce logged separately, combined at meal time)

It also defines how these modes integrate with:
- Browse filters (`All`, `Quick`, `Meal Prep`, `Sit-Down`)
- Chronometer logging
- MES scoring
- Recipe import pipeline (including MES gate + side recommendation upgrades)

This plan is intended to be detailed enough for a new developer to execute without prior context.

---

## Product Goals

### Primary goals
- Reduce decision fatigue while keeping meals metabolically strong.
- Support both user workflows:
  - "I want one complete meal now" (sit-down)
  - "I meal prep components and assemble later" (meal prep)
- Prevent false-low MES scores on partial items (e.g., rice-only or protein-only entries).

### UX goals
- Keep Browse top filters simple and clear.
- Let users swap veggie/salad sides to fit preferences.
- Maintain modern, glassmorphic feel with clear hierarchy and low cognitive load.

---

## Core Concept

A single food concept can exist in two representations:

- **Composed representation**: one complete plate (e.g., "Chicken Shawarma Plate")
- **Component representation**: separate items (e.g., "Seasoned Rice", "Shawarma Chicken", "Tomato Cucumber Salad", "Garlic Yogurt Sauce")

These are linked by a shared `meal_group_id`.

---

## User-Facing Behavior

## Browse filters (top row)
- **All**: show both composed meals and components
- **Quick**: speed-oriented items (composed and/or components)
- **Meal Prep**: show decoupled components only
- **Sit-Down**: show composed meals only

## Meal Prep view behavior
- User sees individual component cards.
- User can bulk prep components with servings.
- MES badge on components should be contextual (see scoring policy below).

## Sit-Down view behavior
- User sees one complete meal card.
- Default side pairing is pre-applied for MES completeness.
- User may tap "Swap Side" to choose alternatives.
- Display MES for the complete plate (not just one component).

---

## Scoring Policy (MES)

### Problem to solve
Decoupled components are not full meals and should not be penalized as if they are complete meal events.

### Policy
1. **Composed meal**: full MES scoring enabled.
2. **Component items**:
   - do not show punitive full-meal MES tier by default
   - optionally show "Component quality" hints
3. **Chronometer meal event (composite)**:
   - when user combines components into lunch/dinner event, compute and display combined MES
4. **Desserts and sauces**:
   - tracked in daily totals
   - not scored as standalone full meals

### MES import gate alignment
- Importer gate applies to **composed meals**.
- For meal-prep components, importer can admit if component-quality checks pass and there is a valid pairing path to meet target MES.

---

## Data Model Changes

## Recipe model additions
Add fields to `Recipe` (or equivalent schema DTO):

- `recipe_role: string`
  - enum values: `full_meal | protein_base | carb_base | veg_side | sauce | dessert`
- `is_component: boolean`
- `meal_group_id: string | null`
  - shared id linking all representations of the same meal concept
- `default_pairing_ids: string[]`
  - for full meals and components (recommended companions)
- `component_composition: object | null`
  - only for composed meals; references expected component roles/ids
- `is_mes_scoreable: boolean`
  - quick UI flag for badges

## Optional pairing table (if normalized)
`meal_pairings`
- `id`
- `meal_group_id`
- `source_recipe_id`
- `target_recipe_id`
- `pair_type` (`default`, `alternative`, `user_preference_weighted`)
- `expected_mes_delta`

---

## API Changes

## Browse endpoint
`GET /recipes/browse`

Add filter params:
- `view_mode=all|quick|meal_prep|sit_down`
- `recipe_role` (optional)
- `meal_group_id` (optional)
- `side_type=veg_side|salad` (for side browser)

Response additions:
- `recipe_role`
- `is_component`
- `meal_group_id`
- `default_pairing_ids`
- `is_mes_scoreable`
- `mes_context` (e.g., `full_meal`, `component`, `dessert`, `sauce`)

## Pairing suggestions endpoint
`GET /metabolic/pairings/suggestions?recipe_id=<id>&limit=5`

Returns side options sorted by:
- MES delta
- user preference match
- prep time
- cuisine compatibility

## Composite preview endpoint
`POST /metabolic/score/preview-composite`
Body:
```json
{
  "recipe_ids": ["protein_id", "carb_id", "veg_id", "sauce_id"],
  "servings": [1, 1, 1, 0.5]
}
```
Returns:
- aggregated nutrition
- raw + display MES
- sub-score breakdown
- tier + recommendation

## Chronometer log endpoint extension
Allow a single meal event to include multiple linked components:
- `meal_event_id`
- `component_logs[]`
- computed `composite_mes`

---

## Import Pipeline Changes

## Existing pipeline constraints
Current import scripts:
- `backend/import_wholefood_site_recipes.py`
- `backend/import_moribyan_wholefoods.py` (wrapper)

## Required import behavior updates
1. Detect if imported recipe is likely full meal vs component.
2. Assign `recipe_role` and `is_component`.
3. If full meal fails MES gate:
   - generate default side options (veg/salad focused)
   - compute MES with side candidates
   - if upgraded combo clears threshold, store:
     - base meal record
     - default side pair
     - suggested alternative sides
   - if still fails, reject import
4. Decode HTML entities in all text fields.
5. Enforce taxonomy quality:
   - valid `protein_type` and `carb_type`
   - non-empty `flavor_profile`
   - accurate `cuisine`
   - meaningful tags (`breakfast/lunch/snack/dinner` + `quick/sit-down/meal-prep`)

## Side generation strategy (v1)
Maintain a curated side library with tags:
- `veg_side` or `salad`
- fiber boost level
- cuisine compatibility
- allergens
- prep time

For MES-upgrade candidates, prioritize:
- high-fiber, low-sugar, low-friction sides
- user preferences when available

---

## Chronometer Changes

## Current issue
Single components logged independently produce misleading low MES.

## New behavior
### Log as Composite Meal Event
When user logs component items for a meal slot (e.g., lunch):
- create one `meal_event`
- attach component entries
- compute combined nutrition + MES
- display one MES badge for the event

### UI requirements
- Meal row shows:
  - "Lunch (Composite)"
  - components chips: `Chicken`, `Rice`, `Salad`
  - final MES badge
- Expand row to inspect component nutrition

### Dessert handling
- Allowed in Chronometer timeline
- Included in daily totals
- no standalone full-meal MES label

---

## Frontend Plan (Glassmorphic UX)

## Browse
- Keep top 4 tabs as primary nav.
- Add subtle glass chips for role filters in Meal Prep mode:
  - Protein Bases, Carbs, Veggies/Salads, Sauces
- Sit-Down cards include:
  - default side indicator
  - "Swap Side" CTA
  - MES delta preview

## Recipe Detail
For full meals:
- "Default Pairing" card (glass panel)
- "Swap veggie/salad" bottom sheet
- "MES Impact" animated delta (e.g., `72 -> 81`)

For components:
- "Best paired with" card
- "Add to Plate" CTA

## Chronometer
- Composite meal cards with layered glass containers
- Component chips inside card
- one combined MES ring/badge per meal event

---

## Implementation Phases

## Phase 1 — Data + API foundation
- Add recipe role + grouping fields
- Add browse mode filtering on backend
- Add composite MES preview endpoint
- Add pairing suggestion endpoint

## Phase 2 — Import + MES upgrade path
- Integrate side suggestion flow into importer
- Store default + alternatives for low-MES base meals
- Ensure imports meet taxonomy quality checks

## Phase 3 — UI integration
- Browse mode behavior updates
- Recipe detail default side/swap flow
- Chronometer composite event logging + display

## Phase 4 — Metrics + tuning
Track:
- % low-MES meals rescued by side pairing
- % users changing default side
- composite log adoption rate
- time-to-log in Chronometer
- median meal MES before/after side pairing

---

## Acceptance Criteria

### Functional
- Meal Prep tab shows components only.
- Sit-Down tab shows composed meals only.
- A meal group can render both representations from linked records.
- Full-meal MES is computed on composed view and composite Chronometer events.
- Component-only logs do not show punitive full-meal MES.

### Quality
- Imported records pass schema and taxonomy checks.
- Text fields are entity-decoded.
- No empty `protein_type` / `carb_type` for scoreable meals.
- No empty `flavor_profile` for scoreable meals.

### UX
- Default side appears automatically for low-MES base meals.
- User can swap side with at least 3 relevant alternatives.
- MES update is visible and understandable in <2 interactions.

---

## Risks + Mitigations

1. **Over-complexity in Browse**
   - Mitigation: keep top tabs fixed; role chips only shown in Meal Prep tab.

2. **Incorrect auto-pairings**
   - Mitigation: start from curated side library + cuisine constraints.

3. **Importer drift in classification quality**
   - Mitigation: add validation script against `all_meal_export.json` standards.

4. **Chronometer logging friction**
   - Mitigation: 1-tap "Log as Plate" presets for common combinations.

---

## File Touch Map (expected)

### Backend
- `backend/app/models/recipe.py` (new role/group fields)
- `backend/app/routers/recipes.py` (browse filters)
- `backend/app/routers/metabolic.py` (pairing + composite preview)
- `backend/import_wholefood_site_recipes.py` (MES rescue via side pairing)
- `backend/import_moribyan_wholefoods.py` (wrapper stays aligned)

### Frontend
- `frontend/components/MealsTab/BrowseView.tsx` (mode-aware rendering)
- `frontend/components/PlateComposer.tsx` (component composition)
- `frontend/app/browse/[id].tsx` (default side + swap flow)
- `frontend/app/(tabs)/chronometer.tsx` (composite meal event display)
- `frontend/stores/plateStore.ts` (component grouping state)
- `frontend/stores/metabolicBudgetStore.ts` (composite MES calls)

---

## Developer Notes
- Use `all_meal_export.json` as recipe schema and quality reference.
- Do not use title prefixes (natural naming only).
- Do not penalize components as standalone full meals.
- Keep the UX polished, minimal, and glassmorphic.

---

## Next Action
Start with **Phase 1** (data model + browse/API wiring), then test with:
- Greek Chicken + Potato Sheet Pan Bake group
- Meal Prep mode: separated components
- Sit-Down mode: composed plate + default salad side
- Chronometer composite logging for lunch
