# Real Food — Product Plan

## Vision

A consumer mobile app that helps people ditch processed food and eat real, whole-food meals — powered by AI coaching, a global recipe database, and a community of like-minded eaters. Freemium model with a free tier generous enough to hook users and a premium tier worth paying for.

---

## What's Already Built (v0.1)

| Area | Status | Notes |
|------|--------|-------|
| Auth (email + social) | Done | Registration, login, JWT tokens |
| Healthify Chat | Done | LLM transforms junk food into whole-food recipes, streaming, recipe cards, ingredient swaps |
| Meal Plan Generator | Done | LLM-powered weekly plans with DB fallback, preference-based |
| Grocery List | Done | Auto-generated from meal plans, categorized, checkable |
| Recipe Database | Done | 211 seeded meals across 17 cuisines, browse/filter/search, detail view with nutrition + health benefits |
| Nutrition Engine | Done | Deterministic ingredient-to-health-benefit tagging (12 categories), macro + micronutrient estimates |
| Gamification (basic) | Partial | XP/levels display, streak badge, daily quests (frontend-only), achievements (model exists, not seeded) |
| Food Database | Partial | USDA API integration exists, needs API key, mock fallback |
| Cook-Along Mode | Stubbed | Screen exists, cook assistant agent exists, not connected |
| Profile | Done | Stats, preferences, logout |

---

## Roadmap

### Phase 1 — Polish & Foundation (Current Priority)

**Goal:** Make what exists feel solid, fix gaps, prepare for new features.

- [ ] **Persist daily quests & achievements server-side** — Seed achievement definitions, add automatic unlock logic (e.g., "first meal plan", "10 recipes browsed"), sync quests to backend so progress survives app restarts.
- [ ] **Auto-update streak on app open** — Call streak endpoint automatically when user opens the app each day instead of requiring manual trigger.
- [ ] **Connect Cook-Along screen** — Wire up the existing cook assistant agent to the cook/[id] screen so users get step-by-step AI guidance while cooking.
- [ ] **Sync saved recipes to backend** — Add a `saved_recipes` table and endpoints so saves persist across devices.
- [ ] **Weekly stats tracking** — Track meals cooked, recipes saved, foods explored on the backend; display real numbers on the Home dashboard.
- [ ] **Recipe images** — Generate or source images for seeded recipes (could use AI image generation or a free food image API).
- [ ] **Error handling & loading states** — Audit all screens for edge cases, empty states, network errors, token expiry.
- [ ] **Light/dark mode toggle** — Theme system exists but no user toggle; add to profile settings.

---

### Phase 2 — Daily Nutrition Tracking & Logging

**Goal:** Users can log what they eat and see how their nutrition stacks up.

- [ ] **Food logging UI** — Quick-add meals from saved recipes, browse history, or manual entry. Searchable with autocomplete.
- [ ] **Daily nutrition dashboard** — Calories, macros (protein/carbs/fat/fiber), key micros. Visual progress rings or bar charts against daily targets.
- [ ] **Meal photo logging** — Snap a photo of your meal; optionally use AI vision to identify ingredients and estimate nutrition.
- [ ] **Nutrition goals** — Let users set calorie/macro targets based on their goals (weight loss, muscle gain, maintenance). AI can suggest targets.
- [ ] **Weekly/monthly nutrition reports** — Trends over time, averages, streaks of hitting targets.
- [ ] **Integration with Apple Health / Google Fit** — Push nutrition data to health platforms; pull activity data for calorie burn estimates.

---

### Phase 3 — AI Nutrition Coach

**Goal:** Personalized, ongoing AI guidance — not just one-off recipe transforms.

- [ ] **Proactive daily check-ins** — AI sends a push notification or in-app prompt: "What are you craving today?" or "You've been low on iron this week — try this."
- [ ] **Goal-aware coaching** — AI understands the user's health goals (gut health, weight loss, more energy) and tailors suggestions accordingly.
- [ ] **Ingredient deep-dives** — Ask the AI "Why is turmeric good for me?" and get an evidence-based answer with recipe suggestions.
- [ ] **Meal plan adjustments** — "I have leftover chicken and sweet potatoes" → AI modifies tomorrow's plan to use them up.
- [ ] **Restaurant menu analysis** — User pastes or photographs a restaurant menu; AI highlights the best whole-food options and suggests modifications to ask for.
- [ ] **Dietary transition plans** — Guided programs like "30-day seed oil elimination", "2-week gut reset", "transition to dairy-free" with daily AI coaching.

---

### Phase 4 — Advanced Meal Prep & Family Planning

**Goal:** Real-world meal prep for busy households.

- [ ] **Batch cooking planner** — Identify overlapping ingredients across the week; schedule one big cook day with a prep timeline.
- [ ] **Freezer meal system** — Tag recipes as freezer-friendly; generate "cook once, eat twice" plans with thawing reminders.
- [ ] **Household profiles** — Add family members with individual preferences, allergies, and portion sizes. Meal plans accommodate everyone.
- [ ] **Kid-friendly mode** — Filter or adapt recipes for children; track picky eater progress ("Tried 3 new vegetables this month!").
- [ ] **Leftover management** — Log what's in your fridge; AI suggests meals using what you have before it goes bad.
- [ ] **Prep timer & cook mode** — Multi-recipe timer coordination ("Start the rice now, chicken goes in at 5:15").

---

### Phase 5 — Barcode Scanning & Packaged Food Analysis

**Goal:** Help users make better choices at the grocery store.

- [ ] **Barcode scanner** — Scan any packaged food; show ingredient analysis with red flags (seed oils, refined sugars, artificial additives).
- [ ] **Ingredient traffic light** — Green/yellow/red rating for each ingredient with explanations.
- [ ] **Whole-food alternative suggestions** — "This granola bar has canola oil and sugar. Try making these energy balls instead" (links to recipe).
- [ ] **Product comparison** — Scan two products side-by-side to compare ingredients and nutrition.
- [ ] **Personal blacklist** — Users define their own "never buy" ingredients; scanner flags them automatically.
- [ ] **Scan history** — Log of everything scanned with ratings, so users can reference past decisions.

---

### Phase 6 — Grocery Delivery Integration

**Goal:** One-tap ordering of whole-food groceries.

- [ ] **Instacart / Amazon Fresh integration** — Convert grocery list into a cart on a delivery platform.
- [ ] **Store-specific product matching** — Match generic ingredients ("chicken thighs") to actual products at the user's preferred store.
- [ ] **Price comparison** — Show estimated costs across available stores.
- [ ] **Smart substitutions** — If an item is unavailable, suggest the closest whole-food alternative (not a processed substitute).
- [ ] **Recurring orders** — Pantry staples (olive oil, spices, rice) auto-reorder when running low.

---

### Phase 7 — Social & Community

**Goal:** Build a community around real food.

- [ ] **User profiles (public)** — Bio, favorite cuisines, dietary style, recipe count, streak.
- [ ] **Recipe sharing** — Share AI-generated or saved recipes with the community. Upvote/comment system.
- [ ] **Follow system** — Follow other users; see their shared recipes in a feed.
- [ ] **Community challenges** — "No seed oils for 30 days", "Cook 5 cuisines this week" — with leaderboards and XP rewards.
- [ ] **Recipe reviews & photos** — Users post photos of recipes they've cooked with ratings and tips.
- [ ] **Meal plan sharing** — Share your weekly plan as a template others can adopt.
- [ ] **Groups** — Create or join groups (e.g., "Whole30 Support", "South Asian Home Cooks").

---

### Phase 8 — Educational Content

**Goal:** Teach users *why* whole food matters, not just *what* to eat.

- [ ] **Ingredient encyclopedia** — Deep-dive pages for common whole-food ingredients: health benefits, how to select, how to store, how to cook.
- [ ] **"Why it's bad" explainers** — Tap any red-flagged ingredient (seed oils, high-fructose corn syrup) for a clear, evidence-based explanation.
- [ ] **Video tutorials** — Short cooking technique videos (how to break down a chicken, how to temper spices, knife skills).
- [ ] **Weekly articles / blog** — Curated content on nutrition science, food industry practices, seasonal eating.
- [ ] **Guided programs** — Multi-week structured programs with daily lessons + recipes (e.g., "Intro to Whole Food Eating").

---

## Monetization — Freemium Model

### Free Tier
- Healthify chat (5 transforms/day)
- Browse full recipe database
- 1 meal plan per week
- Basic grocery list
- Barcode scanning (5 scans/day)
- Daily nutrition logging
- Community access (read-only)

### Premium ($7.99/mo or $59.99/yr)
- Unlimited Healthify transforms
- AI nutrition coach (proactive check-ins, goal tracking, restaurant analysis)
- Unlimited meal plans with family/household support
- Advanced meal prep & batch cooking planner
- Unlimited barcode scanning + scan history
- Grocery delivery integration
- Full community access (post, share, create groups)
- Dietary transition programs
- Ad-free experience
- Priority AI responses

---

## Technical Milestones

| Milestone | Dependencies | Effort |
|-----------|-------------|--------|
| Backend user preferences v2 (goals, targets) | None | Small |
| Push notification infrastructure | Expo push tokens, backend scheduler | Medium |
| Image storage (recipe photos, meal logs) | S3 or Cloudinary | Medium |
| Barcode API integration (Open Food Facts) | None | Medium |
| Grocery delivery API (Instacart Connect) | Partnership / API access | Large |
| Social backend (follows, feed, comments) | New models, pagination, moderation | Large |
| Apple Health / Google Fit SDK | Native modules, Expo config plugin | Medium |
| Camera/vision AI (meal photo analysis) | Gemini vision or similar | Medium |
| PostgreSQL migration for production | Alembic, hosting (Railway/Render) | Small |
| CI/CD pipeline | GitHub Actions, EAS Build | Medium |
| App Store submission | Apple Developer account, review prep | Medium |

---

## Guiding Principles

1. **Whole food only** — No seed oils, no refined sugars, no artificial anything. Every recipe and suggestion follows this standard.
2. **No LLM dependency for core data** — Recipe database, nutrition tagging, and health benefits are deterministic. AI enhances but the app works without it.
3. **Bold flavors from everywhere** — The recipe database should represent the full spectrum of global cuisines. No bland food.
4. **Earn trust through transparency** — When we flag an ingredient as harmful, we explain why with sources. No fear-mongering.
5. **Make it easy** — The biggest barrier to eating well is effort. Every feature should reduce friction: fewer decisions, less time, simpler shopping.
