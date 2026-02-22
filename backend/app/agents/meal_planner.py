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

Respond with a JSON object with this structure:
{
  "days": [
    {
      "day": "Monday",
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
              "fiber": 8
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

    user_message = f"""Create a weekly meal plan with these preferences:
- Flavor preferences: {', '.join(prefs.get('flavor_preferences', ['varied']))}
- Dietary restrictions: {', '.join(prefs.get('dietary_restrictions', ['none']))}
- Allergies: {', '.join(prefs.get('allergies', ['none']))}
- Cooking time budget: {json.dumps(prefs.get('cooking_time_budget', {'quick': 4, 'medium': 2, 'long': 1}))}
- Household size (servings): {prefs.get('household_size', 1)}
- Budget level: {prefs.get('budget_level', 'medium')}
- Include bulk cooking: {prefs.get('bulk_cook_preference', True)}
- Meals per day: {prefs.get('meals_per_day', 3)}
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


async def generate_meal_plan_agent(preferences: dict) -> dict:
    state = {
        "preferences": preferences,
        "meal_plan": {},
        "final_response": "",
    }

    result = await graph.ainvoke(state)
    response_text = result.get("final_response", "")

    try:
        parsed = json.loads(response_text)
        return parsed
    except json.JSONDecodeError:
        start = response_text.find("{")
        end = response_text.rfind("}") + 1
        if start != -1 and end > start:
            try:
                parsed = json.loads(response_text[start:end])
                return parsed
            except json.JSONDecodeError:
                pass
        return {"days": [], "error": "Failed to parse meal plan"}
