# AI Meal Scan Plan (Whole-Foods + MES Recovery)

## Goal
Build a production-ready meal scan system where a user can:
1. Take a photo of a current meal (home/restaurant)
2. Get a metabolic health score + whole-food classification
3. Receive actionable "upgrade next time" and "recover today" guidance
4. Log the meal into Chronometer with confidence metadata

This plan is aligned with the current Real-Food architecture and MES direction.

---

## Product Outcomes

### Primary outcomes
- Reduce logging friction (scan > manual entry)
- Improve day-of adherence via recovery guidance
- Increase Chronometer daily active usage
- Improve trust with explainable scoring + confidence

### User promises
- "Scan any meal in seconds"
- "See if it aligns with Whole Foods standards"
- "Get practical suggestions, not guilt"

---

## Scope (v1)

### In scope
- Single image meal scan
- Ingredient + meal type extraction
- Approximate nutrition estimate (grounded by nutrition DB)
- Whole-food pass/fail + flagged ingredients
- MES score preview for scanned meal
- Recovery suggestions for next meals in same day
- One-tap log to Chronometer

### Out of scope (v2+)
- Multi-image plate decomposition
- Barcode scanning
- Restaurant menu API integration
- Computer-vision portion segmentation
- Personalized glucose response prediction

---

## UX Flow

1. User opens **Scan Meal**
2. Captures photo (or selects from gallery)
3. Optional quick context chips:
   - meal type (breakfast/lunch/dinner/snack)
   - portion size (small/medium/large)
   - "restaurant" vs "home"
4. App returns **Scan Result Card**:
   - Estimated meal name
   - Whole-food status (pass/warn/fail)
   - Estimated macros + key micronutrients
   - MES score (raw + display)
   - Confidence indicator
5. App shows two CTA blocks:
   - **Upgrade Next Time** (swap suggestions)
   - **Recover Today** (next-meal targets)
6. User taps **Log to Chronometer**

---

## Scoring + Classification Strategy

## 1) Whole-food classifier
Use deterministic rules (not LLM-only final decision).

### Flag categories
- Seed oils
- Refined sugars / HFCS
- Ultra-processed additives (emulsifiers, artificial flavors/colors)
- Non-compliant flour where substitution unavailable

### Output
```json
{
  "whole_food_status": "pass|warn|fail",
  "flags": [
    {"ingredient": "canola oil", "reason": "seed_oil", "severity": "high"}
  ],
  "suggested_swaps": [
    {"from": "canola oil", "to": "extra virgin olive oil"}
  ]
}
```

## 2) MES scoring
Use existing backend MES engine for consistency.

- If scan meal is classed as `full_meal`, compute meal MES.
- If scan resembles a component-only item (e.g., fries/snack/sauce), avoid misleading full-meal framing and use contextual guidance.

## 3) Confidence model
Return confidence on:
- ingredient extraction
- portion estimate
- nutrition estimate

Confidence bands:
- High (>=0.80)
- Medium (0.60–0.79)
- Low (<0.60, prompt user edits)

---

## AI/LLM Architecture

## Recommended stack
- **Primary multimodal model:** Gemini 2.0 Flash
- **Fallback model (low confidence / retry):** GPT-4.1 Vision or Claude Sonnet Vision
- **Nutrition grounding:** USDA FoodData Central lookup + deterministic aggregation

## Why
- Gemini Flash gives speed/cost efficiency
- Fallback improves edge-case reliability
- Grounding prevents pure-LLM macro hallucinations

## Pipeline
1. Vision extraction prompt → candidate ingredients + dish type + rough portions
2. Normalize ingredients via alias dictionary
3. Map ingredients to USDA entities
4. Aggregate macro/micro estimate
5. Run Whole-food rule engine
6. Run MES engine
7. Generate suggestions + recovery plan

---

## Data Model Additions

### New table: `scanned_meal_logs`
- `id`
- `user_id`
- `image_url` (or blob ref)
- `meal_label`
- `estimated_ingredients` (json)
- `normalized_ingredients` (json)
- `nutrition_estimate` (json)
- `whole_food_status` (pass/warn/fail)
- `whole_food_flags` (json)
- `mes_raw`
- `mes_display`
- `mes_sub_scores` (json)
- `confidence` (float)
- `confidence_breakdown` (json)
- `source_model` (gemini_flash / fallback)
- `logged_to_chronometer` (bool)
- `created_at`

### Chronometer extension
Allow `source="scan"` entries with:
- `estimated=true`
- confidence metadata
- edit history

---

## API Plan

## `POST /api/scan/meal`
### Request
- image file
- optional context: meal type, portion hint, restaurant/home

### Response
```json
{
  "meal_label": "Chicken shawarma plate",
  "whole_food_status": "warn",
  "whole_food_flags": [...],
  "nutrition_estimate": {...},
  "mes": {
    "raw": 72.4,
    "display": 72.4,
    "tier": "stable",
    "sub_scores": {...}
  },
  "confidence": 0.76,
  "upgrade_suggestions": [...],
  "recovery_plan": [...]
}
```

## `POST /api/scan/meal/log`
Logs scan result to Chronometer.

## `PATCH /api/scan/meal/{id}`
User correction endpoint for ingredient/portion adjustments.

---

## Prompt Design (v1)

### Vision extraction prompt constraints
- Return strict JSON only
- Include visible uncertainty markers
- Never fabricate brand-specific facts without confidence
- Prefer "unknown" over guessing when uncertain

### Required fields
- candidate dish name
- visible ingredients
- probable hidden ingredients (optional, with confidence)
- portion estimates per component
- preparation style (fried/grilled/baked)

---

## Recovery Guidance Logic

If scanned meal scores low:
- Generate same-day guidance using metabolic budget remaining:
  - increase next meal protein/fiber targets
  - cap sugar/net-carb in next meal
  - suggest hydration/walk timing optionally

Tone rules:
- no shame language
- practical and specific
- one-step next action first

---

## UI/Design Notes (Glassmorphic)

### Scan Result card
- translucent panel with confidence chip
- MES ring + sub-score mini bars
- color system:
  - pass: emerald
  - warn: amber
  - fail: rose

### Guidance panels
- "Upgrade next time" panel
- "Recover today" panel
- keep each panel max 3 bullets to avoid overload

### Editing
- inline ingredient chips editable
- quantity slider for serving correction
- recompute button with smooth score animation

---

## Safety + Reliability

- Never expose raw provider error text to user
- Rate-limit scan endpoint (higher abuse risk)
- Validate image mime/size
- Strip EXIF metadata where appropriate
- Cache repeat scans by image hash for cost control

---

## Metrics

Track:
- scan_success_rate
- median scan latency
- confidence distribution
- correction rate after scan
- log-to-chronometer conversion
- day-7 retention for scanners vs non-scanners
- average MES delta after recovery suggestions

---

## Rollout Plan

## Phase 1 (internal)
- Basic scan + nutrition + MES + log
- No fallback model yet

## Phase 2 (beta)
- Add whole-food flags + swap guidance
- Add recovery guidance
- Add confidence UI + edit flow

## Phase 3 (public)
- Add fallback model path
- Add restaurant tuning
- Add analytics dashboard + cost monitoring

---

## Implementation Checklist

- [ ] Create scan router + service layer in backend
- [ ] Add `scanned_meal_logs` migration/model
- [ ] Integrate Gemini vision call wrapper
- [ ] Implement ingredient normalization + USDA grounding
- [ ] Implement whole-food rules engine
- [ ] Reuse MES engine scoring output
- [ ] Build Scan UI in frontend
- [ ] Build editable result + log flow
- [ ] Add rate limits + payload validation
- [ ] Add observability + metrics events

---

## Open Questions

1. Should scan scores contribute to quests immediately or only after user confirms?  
2. Should restaurant meals default to stricter confidence warnings?  
3. Should low-confidence scans be auto-routed to fallback model or ask user first?  
4. Should we store scan images long-term or only derived metadata?

---

## Owner Notes
- Keep this system explainable: users should always know **why** a meal got its score.
- Prioritize speed and trust over perfect precision.
- Recovery guidance is a differentiator; make it simple and actionable.
