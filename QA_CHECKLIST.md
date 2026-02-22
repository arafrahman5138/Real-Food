# Real-Food MVP QA Checklist

## Scope
Auth → Onboarding → Home quests → Healthify → Meal Plan → Grocery → Profile XP

## Automated checks
- [x] Frontend type check passes: `cd frontend && npx tsc --noEmit`
- [ ] Lint passes (add lint script if not configured)

## Manual happy-path checks (iOS/Android)
1. **Login/Register**
   - [ ] New user can register and is routed to onboarding.
   - [ ] Existing user can login.
2. **Onboarding**
   - [ ] Step flow works (Flavor → Dietary → Allergies).
   - [ ] Continue is disabled until required choices are made.
   - [ ] Finish saves preferences and routes to tabs.
3. **Home / Quests**
   - [ ] Daily quest list appears with progress and completion %.
   - [ ] Progress updates reflect actions in other tabs.
4. **Healthify**
   - [ ] Sending a prompt returns assistant response.
   - [ ] Completing Healthify quest triggers XP toast.
5. **Meal Plan**
   - [ ] Meal plan generates (API or fallback sample).
   - [ ] Completing Meal Plan quest triggers XP toast.
6. **Grocery**
   - [ ] Checking items updates UI and progress bar.
   - [ ] Completing Grocery quest triggers XP toast.
7. **Profile**
   - [ ] XP display updates after quest completion.
8. **Navigation / Stability**
   - [ ] No crashes navigating tabs repeatedly.
   - [ ] No broken routes from Home quick actions.

## Edge-case checks
- [ ] API unavailable: friendly errors shown, no hard crash.
- [ ] User without onboarding prefs is redirected to onboarding.
- [ ] Rapid taps on action buttons do not create duplicate state corruption.
