from typing import List, Optional, AsyncIterator
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, END
from typing_extensions import TypedDict
from app.agents.llm_provider import get_llm


class HealthifyState(TypedDict):
    messages: list
    user_input: str
    analysis: str
    swaps: list
    recipe: dict
    nutrition: dict
    final_response: str


SYSTEM_PROMPT = """You are a health food expert at WholeFoodLabs. Your mission is to help people transform 
their favorite unhealthy foods into delicious, whole-food alternatives.

When a user tells you about an unhealthy food they love, you should:

1. ANALYZE: Identify the key unhealthy ingredients (processed sugars, refined flour, artificial additives, 
   seed oils, preservatives, etc.)

2. SWAP: For each unhealthy ingredient, suggest a whole-food substitute that maintains the flavor and 
   texture as much as possible. Explain WHY each swap is healthier.

3. RECIPE: Create a complete recipe using the healthier substitutes. Include:
   - Ingredients list with quantities
   - Step-by-step instructions
   - Prep time and cook time
   - Serving size

4. COMPARE: Provide a brief nutrition comparison (estimated) between the original and your healthified version.

Always be encouraging and positive. Make healthy eating feel exciting, not restrictive.
Respond in a structured JSON format with keys: message, recipe, swaps, nutrition.

The "message" should be a friendly, conversational response.
The "recipe" should have: title, description, ingredients (list of {name, quantity, unit}), 
steps (list of strings), prep_time_min, cook_time_min, servings.
The "swaps" should be a list of {original, replacement, reason}.
The "nutrition" should have: original_estimate {calories, protein, carbs, fat, fiber}, 
healthified_estimate {calories, protein, carbs, fat, fiber}.
"""


async def analyze_food(state: HealthifyState) -> HealthifyState:
    llm = get_llm()
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
    ]
    for msg in state.get("messages", []):
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=state["user_input"]))

    response = await llm.ainvoke(messages)
    state["final_response"] = response.content
    return state


def build_healthify_graph():
    workflow = StateGraph(HealthifyState)
    workflow.add_node("analyze", analyze_food)
    workflow.set_entry_point("analyze")
    workflow.add_edge("analyze", END)
    return workflow.compile()


graph = build_healthify_graph()


async def healthify_agent(
    user_input: str,
    history: List[dict],
    stream: bool = False,
) -> dict | AsyncIterator[str]:
    import json

    state = {
        "messages": history,
        "user_input": user_input,
        "analysis": "",
        "swaps": [],
        "recipe": {},
        "nutrition": {},
        "final_response": "",
    }

    if stream:
        llm = get_llm()
        messages = [SystemMessage(content=SYSTEM_PROMPT)]
        for msg in history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            else:
                messages.append(AIMessage(content=msg["content"]))
        messages.append(HumanMessage(content=user_input))

        async def stream_response():
            async for chunk in llm.astream(messages):
                if chunk.content:
                    yield chunk.content

        return stream_response()

    result = await graph.ainvoke(state)
    response_text = result.get("final_response", "")

    try:
        parsed = json.loads(response_text)
        return {
            "message": parsed.get("message", response_text),
            "recipe": parsed.get("recipe"),
            "swaps": parsed.get("swaps"),
            "nutrition": parsed.get("nutrition"),
        }
    except json.JSONDecodeError:
        return {
            "message": response_text,
            "recipe": None,
            "swaps": None,
            "nutrition": None,
        }
