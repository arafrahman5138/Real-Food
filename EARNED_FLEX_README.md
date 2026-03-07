# Earned Flex Feature Plan

## Summary

This feature introduces a controlled flexibility system that rewards users for eating whole foods consistently during the week.

Instead of positioning treats as failure, the app will let users earn flexibility through consistency:

- `1 Flex Day` per week
- `3 Flex Meals` per week
- or `No Flex`

The product goal is to reinforce a whole-food lifestyle while making room for occasional indulgence without making users feel punished for it.

This is a planning document only. It does **not** imply any implementation has been started.

---

## Product Intent

The app should encourage users to:

- eat whole foods the majority of the time
- stay consistent with high-quality meals
- have room for treats without breaking the experience

This feature should feel like a reward for consistency, not a loophole that invalidates MES.

The system must remain aligned with the existing product philosophy:

- Meals remain the primary MES-scored objects
- Desserts and treats do **not** receive their own meal MES score
- Daily MES can be adjusted to account for treats
- Whole-food consistency should still matter more than isolated indulgence

---

## Naming Recommendation

Internally, the feature can be described as `cheat day / cheat meals`.

User-facing language should avoid sounding punitive or low-quality.

Recommended user-facing name:

- `Earned Flex`

Recommended option labels:

- `1 Flex Day`
- `3 Flex Meals`
- `No Flex`

Recommended support copy:

- `Whole foods most of the time. Room for treats when you earn it.`
- `Stay consistent and unlock flexibility each week.`

---

## Core Weekly Modes

Each user chooses one weekly mode:

1. `No Flex`
2. `1 Flex Day`
3. `3 Flex Meals`

This should be a single weekly preference, not two independent systems.

That keeps the mental model simple:

- pick one flexibility style
- earn it through consistency
- spend it intentionally

---

## Recommended Rules

### Earning logic

The user should not receive flexibility automatically.
They should earn it by hitting a threshold of qualifying meals during the week.

Recommended version 1 thresholds:

- `1 Flex Day` requires `15 qualifying meals`
- `3 Flex Meals` requires `12 qualifying meals`

These values can be tuned later.

### Qualifying meal definition

A qualifying meal should:

- be a logged meal
- be a real meal rather than a dessert or snack treat
- meet the minimum MES threshold for a strong whole-food meal

Recommended initial definition:

- `display MES >= 80`

This matches the current direction of the meal-quality system.

### Spending logic

#### Flex Meals

- User can mark up to 3 logged meals in a week as flex meals
- Each marked meal spends 1 earned flex token
- A flex meal reduces the negative daily MES impact of that meal if it is indulgent
- The flex meal itself does **not** become a qualifying MES meal

#### Flex Day

- User can choose one day in the week as their flex day
- A flex day should be selectable only after the user has earned it
- Once selected, it is locked to that date for the week
- Treats and indulgent meals logged on that date receive softened daily MES penalties

---

## MES Behavior

### Meal-level MES

No change:

- regular meals still use existing MES logic
- desserts and treats still do not receive a meal MES score
- meal prep items still do not receive a meal MES score

### Daily MES

This is where Earned Flex should apply.

Recommended scoring model:

1. Compute the normal daily MES as usual
2. Check whether the user has a valid flex token applied
3. If yes, reduce the treat-related penalty rather than removing it entirely

This is the key design principle:

- flex should soften the penalty
- flex should not erase nutrition reality

### Recommended penalty-softening behavior

Version 1 recommendation:

- non-flex treat: full daily MES impact
- flex-covered treat: only `35% to 50%` of the normal negative impact applies
- flex day: treat-related negative impact is softened for that day, but not zeroed out

This preserves the integrity of MES while still making the feature feel rewarding.

### What flex should not do

Earned Flex should **not**:

- give desserts their own MES score
- make treats count as qualifying meals
- fully cancel poor nutritional impact
- allow unlimited indulgence without consequence

---

## UX Design

### Primary UX principle

The feature should feel supportive and intentional, not like a gimmick.

It should be presented as:

- a consistency reward
- a weekly choice
- a small source of flexibility

### Best user flow

#### 1. Weekly preference

Place a card in onboarding and/or `My Plan`:

`Weekly Flex Style`

Options:

- `1 Flex Day`
- `3 Flex Meals`
- `No Flex`

The card should include a short explanation:

- `Earn flexibility by staying consistent with whole-food meals.`

#### 2. Weekly progress

Show compact progress in `Home` and `My Plan`:

Examples:

- `2 of 3 Flex Meals unlocked`
- `Flex Day unlocked`
- `11 of 15 qualifying meals completed`

This progress should feel motivating, not punishing.

#### 3. Spending a flex token

When the user logs a dessert or indulgent meal:

- if they have available flex, prompt them with a bottom sheet
- if not, log normally

Recommended prompt:

- `Use 1 Flex Meal for this?`
- actions:
  - `Use Flex Meal`
  - `Not Now`

For Flex Day:

- let the user tap a date in the week calendar
- show `Use Flex Day for Friday?`
- once confirmed, lock it for that week

### Where this should appear

Recommended surfaces:

- `My Plan`
- `Home`
- `Chronometer`
- dessert/treat logging flows

Recommended behavior by surface:

#### My Plan

- choose weekly flex style
- show progress toward unlocking
- show whether current week flex has been used

#### Home

- compact weekly progress summary
- lightweight reminder of unlocked status

#### Chronometer

- show if today is the selected Flex Day
- prompt to spend a Flex Meal when logging a treat
- show subtle applied state on logs that used flex

#### Dessert detail or logging sheet

- small chip or action:
  - `Use Flex Meal`

This should be secondary, not the main CTA.

---

## UX Copy Recommendations

Avoid leading with the word `cheat` in the interface.

Preferred copy:

- `Earned Flex`
- `Stay consistent, enjoy flexibility`
- `Whole foods most of the time. Room for treats when you earn it.`
- `Use 1 Flex Meal?`
- `Flex Day unlocked`

Avoid copy that sounds like:

- `you failed`
- `you ruined your score`
- `burn it off`

---

## Data Model Recommendation

### User preference

Add a weekly preference field:

- `earned_flex_mode`
  - `none`
  - `flex_day`
  - `flex_meals`

### Weekly tracking state

Recommended weekly state fields:

- `week_start_date`
- `earned_flex_mode`
- `qualifying_meal_count`
- `qualifying_meal_target`
- `flex_meals_available`
- `flex_meals_used`
- `flex_day_unlocked`
- `flex_day_date`
- `flex_day_used`

### Food log metadata

Recommended per-log fields:

- `used_flex_meal: bool`
- `used_flex_day: bool`
- `flex_adjustment_applied: float | null`

These fields should make the daily scoring explainable and auditable.

---

## Weekly Lifecycle

Recommended weekly lifecycle:

1. New week starts
2. User has chosen a flex mode
3. User logs qualifying meals during the week
4. System tracks progress toward unlock
5. Once threshold is reached, flex becomes available
6. User spends flex intentionally
7. Week resets on next cycle

Reset behavior should be deterministic and based on a clear week boundary.

Recommended initial boundary:

- local week start based on user timezone

---

## Guardrails

To avoid abuse or confusion:

- desserts should not count as qualifying meals
- flex should only soften penalties, not eliminate them
- a Flex Day should lock once chosen
- flex usage should be visible in logs and summaries
- weekly progress should be easy to understand

---

## Suggested Version 1 Scope

Recommended implementation order:

1. Add weekly mode preference
2. Add weekly progress tracking
3. Add Flex Meal spending flow in treat logging
4. Add Flex Day selection flow
5. Add daily MES softening logic
6. Add Home / My Plan status UI

This keeps risk low and allows scoring behavior to be validated before broad UI expansion.

---

## Out of Scope for Version 1

The first version should **not** include:

- dynamic reward tiers beyond the 3 defined modes
- custom user-defined cheat/flex counts
- social sharing around flex usage
- streak bonuses tied to flex
- AI-generated flex recommendations
- meal-level MES for desserts

---

## Open Questions

These are the main items to resolve before implementation:

1. What exact threshold should define a qualifying meal?
   - Recommended initial answer: `display MES >= 80`

2. Should the user earn flex gradually or only once threshold is fully reached?
   - Recommended initial answer: unlock only once threshold is reached

3. How strong should the daily MES penalty reduction be?
   - Recommended initial answer: reduce treat-related penalty to `35% to 50%` of normal impact

4. Can Flex Day be changed after selection?
   - Recommended initial answer: no, lock after confirmation

5. Should users be able to see projected weekly flex progress in My Plan?
   - Recommended initial answer: yes

---

## Recommended Final Product Positioning

This feature should be positioned as:

- consistency-first
- psychologically realistic
- metabolically honest

The user should feel:

- rewarded for eating well
- permitted to enjoy treats
- not punished for being human

The system should still clearly reinforce that:

- whole-food meals drive outcomes
- desserts are optional flexibility, not the foundation

