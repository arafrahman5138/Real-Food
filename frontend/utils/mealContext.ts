/**
 * Client-side meal-context classifier – mirrors
 * backend/app/services/metabolic_engine.py classify_meal_context()
 *
 * Used on Browse cards to decide whether a recipe should
 * display an MES badge or a "prep component" hint.
 */

// ── Keyword sets (keep in sync with backend) ──

const COMPONENT_PROTEIN_KW = new Set([
  'chicken', 'salmon', 'tuna', 'steak', 'tofu', 'eggs',
  'turkey', 'beef', 'shrimp', 'tempeh', 'skewers',
]);
const COMPONENT_CARB_KW = new Set([
  'rice', 'quinoa', 'potato', 'sweet potato', 'pasta',
  'bread', 'oats', 'couscous', 'noodles',
]);
const COMPONENT_VEG_KW = new Set([
  'salad', 'broccoli', 'spinach', 'kale', 'asparagus',
  'green beans', 'roasted vegetables',
]);
const SAUCE_KW = new Set([
  'sauce', 'dressing', 'salsa', 'pesto', 'marinade',
  'gravy', 'condiment', 'hummus', 'guacamole',
]);
const DESSERT_KW = new Set([
  'dessert', 'cake', 'cookie', 'brownie', 'ice cream',
  'pudding', 'pie', 'chocolate', 'pastry', 'muffin',
  'donut', 'cupcake', 'cheesecake', 'tiramisu', 'scone', 'scones',
  'pastries', 'baklava', 'beignet', 'loaf', 'fudge', 'truffle',
]);
const FULL_MEAL_HINT_KW = new Set([
  'ziti', 'lasagna', 'curry', 'stir fry', 'stir-fry', 'bowl',
  'sandwich', 'burger', 'taco', 'burrito', 'pizza', 'casserole',
  'chili', 'soup', 'omelet', 'omelette', 'wrap', 'plate', 'platter',
]);

// ── Context constants ──

export const MEAL_CONTEXT_FULL = 'full_meal';
export const MEAL_CONTEXT_COMPONENT_PROTEIN = 'meal_component_protein';
export const MEAL_CONTEXT_COMPONENT_CARB = 'meal_component_carb';
export const MEAL_CONTEXT_COMPONENT_VEG = 'meal_component_veg';
export const MEAL_CONTEXT_SAUCE = 'sauce_condiment';
export const MEAL_CONTEXT_DESSERT = 'dessert';

export type MealContext =
  | typeof MEAL_CONTEXT_FULL
  | typeof MEAL_CONTEXT_COMPONENT_PROTEIN
  | typeof MEAL_CONTEXT_COMPONENT_CARB
  | typeof MEAL_CONTEXT_COMPONENT_VEG
  | typeof MEAL_CONTEXT_SAUCE
  | typeof MEAL_CONTEXT_DESSERT;

const has = (set: Set<string>, text: string) => {
  for (const kw of set) if (text.includes(kw)) return true;
  return false;
};

/**
 * Classify a recipe / food log entry.
 *
 * @param title       Recipe or food log title
 * @param mealType    Optional explicit meal_type tag
 * @param nutrition   Optional nutrition dict {calories, protein, fiber, …}
 */
export function classifyMealContext(
  title: string | null | undefined,
  mealType?: string | null,
  nutrition?: Record<string, number> | null,
): MealContext {
  if (mealType?.toLowerCase() === 'dessert') return MEAL_CONTEXT_DESSERT;

  const lower = (title ?? '').toLowerCase().trim();
  if (!lower) return MEAL_CONTEXT_FULL;

  // Desserts first
  if (has(DESSERT_KW, lower)) return MEAL_CONTEXT_DESSERT;
  // Sauces / condiments
  if (has(SAUCE_KW, lower)) return MEAL_CONTEXT_SAUCE;

  // Nutrition heuristics
  const cals = Number(nutrition?.calories ?? 0);
  const protein = Number(nutrition?.protein ?? nutrition?.protein_g ?? 0);
  const fiber = Number(nutrition?.fiber ?? nutrition?.fiber_g ?? 0);
  const words = lower.split(/\s+/).filter(Boolean);

  // Full-meal hint keywords
  if (has(FULL_MEAL_HINT_KW, lower)) return MEAL_CONTEXT_FULL;

  const hasProtein = has(COMPONENT_PROTEIN_KW, lower);
  const hasCarb = has(COMPONENT_CARB_KW, lower);
  const hasVeg = has(COMPONENT_VEG_KW, lower);
  const hits = +hasProtein + +hasCarb + +hasVeg;

  // Multiple categories → full meal
  if (hits >= 2) return MEAL_CONTEXT_FULL;
  // Long descriptive titles with conjunctions → full meal
  if (words.length >= 5 && (lower.includes(' with ') || lower.includes(' and '))) return MEAL_CONTEXT_FULL;

  // Conservative component check
  const likelyComponent =
    hits === 1 && (words.length <= 3 || cals <= 300 || (protein <= 15 && fiber <= 6));
  if (!likelyComponent) return MEAL_CONTEXT_FULL;

  if (hasProtein) return MEAL_CONTEXT_COMPONENT_PROTEIN;
  if (hasCarb) return MEAL_CONTEXT_COMPONENT_CARB;
  if (hasVeg) return MEAL_CONTEXT_COMPONENT_VEG;

  return MEAL_CONTEXT_FULL;
}

/** Whether a context should display an MES score badge. */
export function isScoreable(context: MealContext): boolean {
  return context === MEAL_CONTEXT_FULL;
}

/** Whether the item is a combinable prep component (not full meal, not dessert). */
export function isComponent(context: MealContext): boolean {
  return (
    context === MEAL_CONTEXT_COMPONENT_PROTEIN ||
    context === MEAL_CONTEXT_COMPONENT_CARB ||
    context === MEAL_CONTEXT_COMPONENT_VEG ||
    context === MEAL_CONTEXT_SAUCE
  );
}

/** Human-readable label for a non-full-meal context. */
export function contextLabel(context: MealContext): string {
  switch (context) {
    case MEAL_CONTEXT_COMPONENT_PROTEIN: return 'Protein component';
    case MEAL_CONTEXT_COMPONENT_CARB: return 'Carb component';
    case MEAL_CONTEXT_COMPONENT_VEG: return 'Veggie side';
    case MEAL_CONTEXT_SAUCE: return 'Sauce / condiment';
    case MEAL_CONTEXT_DESSERT: return 'Treat';
    default: return '';
  }
}
