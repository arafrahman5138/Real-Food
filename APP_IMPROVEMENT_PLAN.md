# APP_IMPROVEMENT_PLAN.md

## Purpose
Comprehensive improvement roadmap derived from a full-app audit of every screen, component, store, and service. Organized into phased sprints targeting bugs first, then reliability, code health, and UX polish.

---

## Current State Summary

| Area | Status |
|------|--------|
| **Screens** | 14 screens across 5 bottom tabs + auth + modals |
| **Stores** | 6 Zustand stores (auth, chat, gamification, mealPlan, savedRecipes, theme) |
| **API** | Full REST client with auth, streaming support, and 401 auto-logout |
| **Gamification** | XP, streaks, quests, achievements — partially wired to backend |
| **Nutrition** | Chronometer with macro/micro tracking, gap coach, meal logging |
| **AI** | Healthify chat, ingredient substitution, cook assistant, meal planner |

### What Works Well
- Chronometer visual design (gradient hero, stat row, macro/micro bars, gap coach)
- Auth flow with social login scaffolding
- Recipe detail with ingredient customization and cook mode
- Theme system with dark/light support and persisted preference
- savedRecipesStore with optimistic updates and rollback
- Tab navigation structure with deep-linking support

### What Needs Work
- Error handling is nearly absent across the app
- No pull-to-refresh on any screen
- Multiple stores lack persistence (mealPlan, chat, gamification)
- Gamification is client-only — never syncs with backend
- ~700 lines of code duplicated between Browse screens
- Food detail screen uses hardcoded mock data
- Chat screen is 1,463 lines with no extraction

---

## Phase 1 — Fix Broken Things (P0)

> Goal: Eliminate bugs and broken experiences that erode user trust.

### 1.1 StatusBar Theme Fix
**File:** `frontend/components/ScreenContainer.tsx`
**Problem:** `barStyle="light-content"` is hardcoded, making status bar text invisible in light mode.
**Fix:** Read theme from `useThemeStore` and set `barStyle` to `"dark-content"` for light theme, `"light-content"` for dark theme.
**Effort:** Small (15 min)

### 1.2 Error States on All API Screens
**Problem:** Almost every screen silently swallows API errors with `console.error` or `catch(() => {})`. Users see blank/empty screens with no explanation.
**Screens affected:**
- Home (`index.tsx`) — weekly stats, quests
- Chronometer (`chronometer.tsx`) — daily data, gaps
- Browse (`BrowseView.tsx`, `browse/index.tsx`) — recipe list
- MyPlanView — plan generation
- GroceryView — grocery fetch
- Profile (`profile.tsx`) — achievements
- Food Search (`food/search.tsx`) — search results

**Fix per screen:**
1. Add `error` state variable
2. Set error message in `catch` blocks
3. Render an error card with retry button when `error` is truthy
4. Clear error on successful retry

**Pattern:**
```tsx
const [error, setError] = useState<string | null>(null);

const load = async () => {
  try {
    setError(null);
    // ... fetch
  } catch (e) {
    setError('Unable to load data. Pull down to retry.');
  }
};

// In render:
{error && (
  <Card style={styles.errorCard}>
    <Ionicons name="cloud-offline-outline" size={32} color={colors.error} />
    <Text style={styles.errorText}>{error}</Text>
    <Button title="Retry" onPress={load} variant="outline" size="sm" />
  </Card>
)}
```
**Effort:** Medium (2-3 hours across all screens)

### 1.3 Implement Food Detail Screen
**File:** `frontend/app/food/[id].tsx`
**Problem:** Uses hardcoded `SAMPLE_FOODS` and `HEALTH_FACTS` arrays. Never calls `foodApi.getDetail(id)`.
**Fix:**
1. Call `foodApi.getDetail(id)` on mount
2. Render real nutrition data from the API response
3. Add "Log to Chronometer" button (consistent with recipe detail)
4. Remove `SAMPLE_FOODS` and `HEALTH_FACTS` constants
5. Separate the search-list mode (`id === 'search'`) into its own route or remove it (already exists at `food/search.tsx`)
**Effort:** Medium (2 hours)

### 1.4 Meal Plan Persistence
**File:** `frontend/stores/mealPlanStore.ts`, `frontend/components/MealsTab/MyPlanView.tsx`
**Problem:** Meal plan is lost on app restart. `mealPlanApi.getCurrent()` exists but is never called.
**Fix:**
1. Call `mealPlanApi.getCurrent()` on store initialization / MyPlanView mount
2. Persist plan ID so it can be restored
3. Remove silent fallback to `generateSamplePlan()` — show error instead
4. Display error state when plan generation fails
**Effort:** Medium (1-2 hours)

---

## Phase 2 — Data Reliability (P1)

> Goal: Ensure data stays fresh and synced. Users should never see stale content.

### 2.1 Pull-to-Refresh Everywhere
**Screens to update:**
| Screen | ScrollView Type | Data to Refresh |
|--------|----------------|-----------------|
| Home (`index.tsx`) | ScrollView | Weekly stats, quests, gamification |
| Chronometer (`chronometer.tsx`) | ScrollView | Daily nutrition, gaps |
| BrowseView | FlatList | Recipe list (reset to page 1) |
| browse/index.tsx | FlatList | Recipe list (reset to page 1) |
| MyPlanView | ScrollView | Current plan |
| GroceryView | FlatList | Grocery items |
| Profile (`profile.tsx`) | ScrollView | Stats, achievements |

**Implementation:**
```tsx
import { RefreshControl } from 'react-native';

const [refreshing, setRefreshing] = useState(false);
const onRefresh = async () => {
  setRefreshing(true);
  await loadData();
  setRefreshing(false);
};

<ScrollView
  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
>
```
**Effort:** Medium (2 hours for all screens)

### 2.2 Gamification Backend Sync
**Problem:** `gameApi.updateStreak()` and `gameApi.checkAchievements()` exist but are never called. Quests are client-only with `INITIAL_QUESTS` and reset on restart.
**Fix:**
1. Call `gameApi.updateStreak()` on app foreground (AppState listener)
2. Call `gameApi.checkAchievements()` after meaningful actions (log meal, save recipe, complete cook mode)
3. Fetch quest state from backend instead of using `INITIAL_QUESTS`
4. Persist quest progress locally as a fallback
**Files:** `frontend/stores/gamificationStore.ts`, `frontend/app/(tabs)/index.tsx`
**Effort:** Large (3-4 hours)

### 2.3 Chat History Persistence
**Problem:** Chat messages are lost on app restart. `chatApi.getSessions()` and `chatApi.deleteSession()` exist but are never used.
**Fix:**
1. Load previous session on chat mount via `chatApi.getSessions()`
2. Add "New Conversation" button to clear current and start fresh
3. Optionally persist last session locally via AsyncStorage as backup
**Files:** `frontend/stores/chatStore.ts`, `frontend/app/(tabs)/chat.tsx`
**Effort:** Medium (2 hours)

### 2.4 Grocery State Persistence
**Problem:** Checked grocery items are local-only — lost on app restart.
**Fix:**
1. Sync checked state to backend (if endpoint exists) or persist locally via AsyncStorage
2. Add manual item add/remove capability
**Files:** `frontend/components/MealsTab/GroceryView.tsx`
**Effort:** Medium (1-2 hours)

### 2.5 API Client Resilience
**File:** `frontend/services/api.ts`
**Problem:** No request timeout, no retry logic. Backend hang = infinite wait.
**Fix:**
1. Add `AbortController` with configurable timeout (e.g., 15s default, 60s for AI calls)
2. Add single retry with exponential backoff for 5xx and network errors
3. Wire up the existing `stream()` method for chat (optional, Phase 4)
**Effort:** Medium (1-2 hours)

---

## Phase 3 — Code Health (P2)

> Goal: Reduce duplication, improve maintainability, enforce consistency.

### 3.1 Deduplicate Browse Screens
**Problem:** `BrowseView.tsx` (709 lines) and `browse/index.tsx` (709 lines) are near-identical.
**Fix:**
1. Make `BrowseView.tsx` the single source of truth (accepts optional props for header visibility, navigation behavior)
2. Have `browse/index.tsx` be a thin wrapper: `<ScreenContainer><BrowseView standalone /></ScreenContainer>`
3. Delete duplicated code from `browse/index.tsx`
**Effort:** Medium (1-2 hours)

### 3.2 Extract Shared Constants
**Problem:** `CUISINE_EMOJI` map is duplicated in 3 files.
**Fix:** Move to `frontend/constants/Recipes.ts` and import everywhere.
**Files:** `BrowseView.tsx`, `browse/index.tsx`, `browse/[id].tsx`
**Effort:** Small (30 min)

### 3.3 Extract Chat Parsing Logic
**Problem:** `chat.tsx` is 1,463 lines. ~300 lines of JSON/markdown parsing logic (`extractJsonObject`, `extractRecipeFromMarkdown`, `normalizeAssistantPayload`) pollute the component.
**Fix:**
1. Create `frontend/utils/chatParser.ts`
2. Move all parsing/normalization functions there
3. Import in `chat.tsx`
**Effort:** Small (45 min)

### 3.4 Type Safety Cleanup
**Problem:** `any` types throughout Chronometer screen (`daily`, `gaps`, `selectedNutrient`).
**Fix:** Define proper TypeScript interfaces matching the API response schemas.
```tsx
interface DailyNutrition {
  date: string;
  totals: Record<string, number>;
  comparison: Record<string, { consumed: number; target: number; pct: number; status: string }>;
  daily_score: number;
  logs: FoodLog[];
}
```
**Effort:** Small (1 hour)

### 3.5 ScreenContainer Consistency
**Problem:** Meals tab (`meals.tsx`) is the only tab that doesn't use `ScreenContainer`, manually handling safe area insets instead.
**Fix:** Wrap in `ScreenContainer` or document why it's intentionally different (sub-tabs need custom inset handling).
**Effort:** Small (30 min)

---

## Phase 4 — UX Polish (P3)

> Goal: Refine interactions, add missing affordances, improve feel.

### 4.1 Cook Mode Improvements
**File:** `frontend/app/cook/[id].tsx`
| Fix | Detail |
|-----|--------|
| Timer notification | Add haptic vibration (`expo-haptics`) when timer reaches zero |
| Keep screen awake | Use `expo-keep-awake` to prevent auto-lock during cooking |
| Close button | Add explicit X / Done button (don't rely solely on swipe gesture) |
| Timer persistence | Store timer state so it survives navigation-away |
| Confirm before logging | Show confirmation dialog before auto-logging on "Done" |
**Effort:** Medium (2 hours)

### 4.2 Login & Auth Polish
**File:** `frontend/app/(auth)/login.tsx`
| Fix | Detail |
|-----|--------|
| Input validation | Email regex check, password min length (8 chars), inline error messages |
| Forgot password | Add link (even if it just shows "Contact support" initially) |
| Apple auth guard | Check `AppleAuthentication.isAvailableAsync()` before rendering button |
| Logout confirmation | Add `Alert.alert` confirm dialog before signing out on Profile |
**Effort:** Medium (1-2 hours)

### 4.3 Chat UX Improvements
**File:** `frontend/app/(tabs)/chat.tsx`
| Fix | Detail |
|-----|--------|
| Auto-send chips | Suggestion chips should send immediately, not just populate the input |
| New conversation | Add a "+" or "New Chat" button in the header |
| Saved recipes toggle | Wire up UI button to toggle `showSavedRecipes` |
| Inline confirmations | Replace `Alert.alert` with inline toast for recipe save confirmations |
| Scroll management | Replace `setTimeout(100ms)` with `onContentSizeChange` |
**Effort:** Medium (2 hours)

### 4.4 Chronometer Enhancements
**File:** `frontend/app/(tabs)/chronometer.tsx`
| Fix | Detail |
|-----|--------|
| Show all micros | Replace `.slice(0, 10)` with expandable list ("Show all 28") |
| Nutrient modal enrichment | Show contributing foods and tips in the nutrient detail modal |
| Food search CTA | Add link to `/food/search` alongside the "Browse recipes" CTA |
| Date picker | Allow viewing previous days' nutrition (currently today-only) |
**Effort:** Medium (2-3 hours)

### 4.5 Food Search UX
**File:** `frontend/app/food/search.tsx`
| Fix | Detail |
|-----|--------|
| Debounced search | Search as user types (300ms debounce) instead of requiring Return key |
| Pagination | `onEndReached` for loading more results |
| Quick-log action | "+" button on each search result to log directly without navigating to detail |
**Effort:** Medium (1-2 hours)

### 4.6 Minor UI Fixes
| Fix | File | Detail |
|-----|------|--------|
| Achievements empty state | `profile.tsx` | Change "Achievements loading..." → "No achievements yet" when `!loading && empty` |
| ChipSelector icons | `ChipSelector.tsx` | Render the `icon` field from `ChipOption` (currently defined but ignored) |
| Home quick actions grid | `index.tsx` | Fix orphaned 5th item in 2-column grid (use 6 items or 3-column) |
| Daily tip rotation | `index.tsx` | Fetch tips from backend or rotate from a local array |
| Home `foods_explored` | `index.tsx` | Display the already-fetched `weekly_stats.foods_explored` value |
**Effort:** Small (1-2 hours total)

---

## Sprint Plan

### Sprint 1 — Stability & Trust (1 week)
> **Theme:** "Nothing should feel broken."

| # | Task | Phase | Effort | Priority |
|---|------|-------|--------|----------|
| 1 | StatusBar theme fix | 1.1 | 15 min | P0 |
| 2 | Error states on all screens | 1.2 | 2-3 hrs | P0 |
| 3 | Implement food detail screen | 1.3 | 2 hrs | P0 |
| 4 | Meal plan persistence | 1.4 | 1-2 hrs | P0 |
| 5 | Pull-to-refresh everywhere | 2.1 | 2 hrs | P1 |
| 6 | Logout confirmation dialog | 4.2 | 15 min | P1 |
| 7 | Login input validation | 4.2 | 1 hr | P1 |

**Estimated total:** ~9-11 hours

### Sprint 2 — Reliability & Sync (1 week)
> **Theme:** "Data should persist and stay fresh."

| # | Task | Phase | Effort | Priority |
|---|------|-------|--------|----------|
| 8 | Gamification backend sync | 2.2 | 3-4 hrs | P1 |
| 9 | Chat history persistence + new conversation | 2.3 | 2 hrs | P1 |
| 10 | Grocery state persistence | 2.4 | 1-2 hrs | P1 |
| 11 | API timeout + retry | 2.5 | 1-2 hrs | P1 |
| 12 | Deduplicate Browse screens | 3.1 | 1-2 hrs | P2 |
| 13 | Extract shared constants | 3.2 | 30 min | P2 |

**Estimated total:** ~9-12 hours

### Sprint 3 — Code Health & Polish (1 week)
> **Theme:** "Clean code, refined interactions."

| # | Task | Phase | Effort | Priority |
|---|------|-------|--------|----------|
| 14 | Extract chat parsing logic | 3.3 | 45 min | P2 |
| 15 | Type safety cleanup (Chronometer) | 3.4 | 1 hr | P2 |
| 16 | Cook mode improvements | 4.1 | 2 hrs | P3 |
| 17 | Chat UX improvements | 4.3 | 2 hrs | P3 |
| 18 | Chronometer enhancements | 4.4 | 2-3 hrs | P3 |
| 19 | Food search UX | 4.5 | 1-2 hrs | P3 |
| 20 | Minor UI fixes (batch) | 4.6 | 1-2 hrs | P3 |

**Estimated total:** ~10-13 hours

---

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Food detail API may not return all needed fields | Audit `foodApi.getDetail()` backend response before building UI |
| Gamification backend endpoints may be incomplete | Verify `/game/streak`, `/game/check-achievements` return expected shapes |
| Chat session restore may surface stale/broken messages | Add session age limit; auto-clear sessions older than 7 days |
| Pull-to-refresh on FlatList with pagination | Reset pagination state on refresh; re-fetch from page 1 |

---

## Success Criteria

- [ ] No screen shows blank/empty state on API failure — all have error + retry
- [ ] All scrollable screens support pull-to-refresh
- [ ] Meal plan survives app restart
- [ ] Gamification streak updates on app open
- [ ] Quest progress persists across sessions
- [ ] Food detail shows real API data with log-to-chronometer
- [ ] Zero duplicated screen files (Browse consolidated)
- [ ] Chat screen under 900 lines after extraction
- [ ] StatusBar readable in both light and dark themes
- [ ] Cook mode keeps screen awake and vibrates on timer completion

---

## Files Changed Per Phase

### Phase 1
- `frontend/components/ScreenContainer.tsx`
- `frontend/app/(tabs)/index.tsx`
- `frontend/app/(tabs)/chronometer.tsx`
- `frontend/app/(tabs)/profile.tsx`
- `frontend/components/MealsTab/BrowseView.tsx`
- `frontend/components/MealsTab/MyPlanView.tsx`
- `frontend/components/MealsTab/GroceryView.tsx`
- `frontend/app/browse/index.tsx`
- `frontend/app/food/[id].tsx`
- `frontend/app/food/search.tsx`
- `frontend/stores/mealPlanStore.ts`

### Phase 2
- `frontend/stores/gamificationStore.ts`
- `frontend/stores/chatStore.ts`
- `frontend/app/(tabs)/chat.tsx`
- `frontend/components/MealsTab/GroceryView.tsx`
- `frontend/services/api.ts`

### Phase 3
- `frontend/app/browse/index.tsx` (thin wrapper)
- `frontend/components/MealsTab/BrowseView.tsx` (canonical)
- `frontend/constants/Recipes.ts` (new)
- `frontend/utils/chatParser.ts` (new)
- `frontend/app/(tabs)/chronometer.tsx`

### Phase 4
- `frontend/app/cook/[id].tsx`
- `frontend/app/(auth)/login.tsx`
- `frontend/app/(tabs)/profile.tsx`
- `frontend/app/(tabs)/chat.tsx`
- `frontend/app/(tabs)/chronometer.tsx`
- `frontend/app/food/search.tsx`
- `frontend/components/ChipSelector.tsx`
