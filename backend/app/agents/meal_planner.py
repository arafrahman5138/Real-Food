import json
from typing import List
from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from app.agents.llm_provider import get_llm


class MealPlanState(TypedDict):
    preferences: dict
    meal_plan: dict
    final_response: str


SYSTEM_PROMPT = """You are a meal planning expert at WholeFoodLabs. You create personalized weekly meal plans 
using ONLY whole, unprocessed foods. No refined sugars, no seed oils, no artificial ingredients.

Given user preferences, generate a 7-day meal plan (Monday through Sunday) with the following structure:

IMPORTANT RULES:
- Include 2-3 BULK COOK meals per week (marked as is_bulk_cook: true). These are meals made in large 
  batches (4-6 servings) that can be eaten across multiple days. Place them on Sunday/Monday/Wednesday.
- Include QUICK meals (under 20 min total time) for busy weekday mornings and lunches.
- Include 1-2 SIT-DOWN meals (45+ min) for weekends.
- Every ingredient must be a whole, real food. No processed items.
- Respect all dietary restrictions and allergies.
- Match the user's flavor preferences.
- Each meal should have variety throughout the week.

METABOLIC ENERGY BUDGET RULES (critical — follow precisely):
- Each meal MUST target the per-meal macros provided in the user message.
- protein_target_per_meal: aim to meet or exceed this in every meal.
- fiber_floor_per_meal: aim to meet or exceed this in every meal.
- sugar_ceiling_per_meal: stay at or below this in every meal.
- Prioritize protein-rich whole foods (eggs, fish, poultry, legumes, Greek yogurt).
- Include high-fiber vegetables, beans, and whole grains in every meal.
- Avoid fruits high in sugar (bananas, grapes, mangos); prefer berries and citrus.
- The daily total should hit the full daily targets provided.

Respond with a JSON object with this structure:
{
  "projected_weekly_mes": 85,
  "days": [
    {
      "day": "Monday",
      "projected_daily_mes": 82,
      "meals": [
        {
          "meal_type": "breakfast|lunch|dinner|snack",
          "category": "bulk_cook|quick|sit_down",
          "is_bulk_cook": false,
          "servings": 1,
          "recipe": {
            "title": "Meal Name",
            "description": "Brief description",
            "ingredients": [{"name": "ingredient", "quantity": "1", "unit": "cup", "category": "produce"}],
            "steps": ["Step 1", "Step 2"],
            "prep_time_min": 10,
            "cook_time_min": 15,
            "servings": 1,
            "difficulty": "easy|medium|hard",
            "flavor_profile": ["savory"],
            "dietary_tags": ["gluten-free"],
            "nutrition_estimate": {
              "calories": 400,
              "protein": 25,
              "carbs": 45,
              "fat": 15,
              "fiber": 8,
              "sugar": 4
            }
          }
        }
      ]
    }
  ]
}
"""


async def generate_plan(state: MealPlanState) -> MealPlanState:
    llm = get_llm()
    prefs = state["preferences"]

    # Metabolic budget constraints (injected from caller or defaults)
    protein_daily = prefs.get("metabolic_protein_target_g", 130)
    fiber_daily = prefs.get("metabolic_fiber_floor_g", 30)
    sugar_daily = prefs.get("metabolic_sugar_ceiling_g", 200)
    meals_per_day = prefs.get("meals_per_day", 3)

    protein_per_meal = round(protein_daily / meals_per_day, 1)
    fiber_per_meal = round(fiber_daily / meals_per_day, 1)
    sugar_per_meal = round(sugar_daily / meals_per_day, 1)

    user_message = f"""Create a weekly meal plan with these preferences:
- Flavor preferences: {', '.join(prefs.get('flavor_preferences', ['varied']))}
- Dietary restrictions: {', '.join(prefs.get('dietary_restrictions', ['none']))}
- Allergies: {', '.join(prefs.get('allergies', ['none']))}
- Cooking time budget: {json.dumps(prefs.get('cooking_time_budget', {'quick': 4, 'medium': 2, 'long': 1}))}
- Household size (servings): {prefs.get('household_size', 1)}
- Budget level: {prefs.get('budget_level', 'medium')}
- Include bulk cooking: {prefs.get('bulk_cook_preference', True)}
- Meals per day: {meals_per_day}

METABOLIC ENERGY BUDGET (must follow):
- Daily protein target: {protein_daily}g (≥{protein_per_meal}g per meal)
- Daily fiber floor: {fiber_daily}g (≥{fiber_per_meal}g per meal)
- Daily sugar ceiling: {sugar_daily}g (≤{sugar_per_meal}g per meal)
- Target weekly MES: ≥ 80 (Stable Energy or better every day)
"""

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_message),
    ]

    response = await llm.ainvoke(messages)
    state["final_response"] = response.content
    return state


def build_meal_plan_graph():
    workflow = StateGraph(MealPlanState)
    workflow.add_node("generate", generate_plan)
    workflow.set_entry_point("generate")
    workflow.add_edge("generate", END)
    return workflow.compile()


graph = build_meal_plan_graph()


async def generate_meal_plan_agent(preferences: dict, db=None, user_id: str | None = None) -> dict:
    """Generate a meal plan, injecting metabolic budget constraints if user available."""
    # Inject metabolic budget from DB if available
    if db and user_id:
        from app.services.metabolic_engine import get_or_create_budget
        budget = get_or_create_budget(db, user_id)
        preferences.setdefault("metabolic_protein_target_g", budget.protein_target_g)
        preferences.setdefault("metabolic_fiber_floor_g", budget.fiber_floor_g)
        preferences.setdefault("metabolic_sugar_ceiling_g", budget.sugar_ceiling_g)

    MAX_ATTEMPTS = 3
    MIN_WEEKLY_MES = 80

    for attempt in range(MAX_ATTEMPTS):
        state = {
            "preferences": preferences,
            "meal_plan": {},
            "final_response": "",
        }

        result = await graph.ainvoke(state)
        response_text = result.get("final_response", "")

        parsed = _parse_plan_json(response_text)

        # Validate projected weekly MES if present
        projected = parsed.get("projected_weekly_mes", 0)
        if projected >= MIN_WEEKLY_MES or attempt == MAX_ATTEMPTS - 1:
            return parsed

        # Retry with stricter instruction
        preferences["_retry_hint"] = (
            f"Previous plan scored {projected} MES — below the {MIN_WEEKLY_MES} minimum. "
            "Increase protein and fiber, reduce sugar in every meal."
        )

    return parsed


def _parse_plan_json(response_text: str) -> dict:
    """Extract JSON from LLM response text."""
    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(response_text[start:end])
            except json.JSONDecodeError:
                pass
        return {"days": [], "error": "Failed to parse meal plan"}
