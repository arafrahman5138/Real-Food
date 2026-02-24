from typing import List, Optional, AsyncIterator
import re
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

    def _clean_md_line(line: str) -> str:
        return (
            (line or "")
            .replace("**", "")
            .replace("__", "")
            .strip()
        )

    def _parse_markdown_recipe(raw_text: str) -> dict | None:
        lines = (raw_text or "").splitlines()

        mode = "message"
        saw_recipe = False
        message_lines: list[str] = []
        ingredients: list[dict] = []
        steps: list[str] = []
        swaps: list[dict] = []
        current_swap: dict | None = None

        title = ""
        description = ""
        prep_time = None
        cook_time = None
        servings = None

        def _parse_ingredient(text: str) -> dict | None:
            t = _clean_md_line(text)
            t = re.sub(r"^[-*•]\s*", "", t)
            t = re.sub(r"^\d+[\).\s-]+", "", t)
            if not t:
                return None

            if ":" in t:
                name, qty = t.split(":", 1)
                return {"name": name.strip(), "quantity": qty.strip(), "unit": ""}

            m = re.match(r"^(\d+(?:\/\d+)?(?:\.\d+)?)(?:\s+([a-zA-Z]+))?\s+(.+)$", t)
            if m:
                return {
                    "name": m.group(3).strip(),
                    "quantity": m.group(1).strip(),
                    "unit": (m.group(2) or "").strip(),
                }

            return {"name": t, "quantity": "", "unit": ""}

        for raw in lines:
            line = (raw or "").strip()
            if not line or line.startswith("```") or line.startswith("'''"):
                continue

            clean = _clean_md_line(line)
            clean = re.sub(r"^#+\s*", "", clean).strip()

            title_match = re.match(r"^(?:recipe|title)\s*:\s*(.+)$", clean, re.IGNORECASE)
            if title_match:
                title = title_match.group(1).strip()
                saw_recipe = True
                continue

            desc_match = re.match(r"^description\s*:\s*(.+)$", clean, re.IGNORECASE)
            if desc_match:
                description = desc_match.group(1).strip()
                saw_recipe = True
                continue

            if re.match(r"^ingredients?\s*:?$", clean, re.IGNORECASE):
                mode = "ingredients"
                saw_recipe = True
                continue

            if re.match(r"^(instructions?|steps?|directions?)\s*:?$", clean, re.IGNORECASE):
                mode = "steps"
                saw_recipe = True
                continue

            if re.match(r"^swaps?\s*:?$", clean, re.IGNORECASE):
                mode = "swaps"
                saw_recipe = True
                continue

            if re.match(r"^nutrition(?:\s*comparison)?\s*:?$", clean, re.IGNORECASE):
                mode = "nutrition"
                continue

            prep_match = re.match(r"^prep\s*time\s*:?\s*(\d+)", clean, re.IGNORECASE)
            if prep_match:
                prep_time = int(prep_match.group(1))
                saw_recipe = True
                continue

            cook_match = re.match(r"^cook\s*time\s*:?\s*(\d+)", clean, re.IGNORECASE)
            if cook_match:
                cook_time = int(cook_match.group(1))
                saw_recipe = True
                continue

            servings_match = re.match(r"^servings?\s*:?\s*(\d+)", clean, re.IGNORECASE)
            if servings_match:
                servings = int(servings_match.group(1))
                saw_recipe = True
                continue

            if mode == "ingredients":
                if re.match(r"^(instructions?|steps?|directions?)\s*:?$", clean, re.IGNORECASE):
                    mode = "steps"
                    saw_recipe = True
                    continue
                if re.match(r"^swaps?\s*:?$", clean, re.IGNORECASE):
                    mode = "swaps"
                    continue
                if re.match(r"^nutrition(?:\s*comparison)?\s*:?$", clean, re.IGNORECASE):
                    mode = "nutrition"
                    continue
                ing = _parse_ingredient(line)
                if ing:
                    ingredients.append(ing)
                    saw_recipe = True
                continue

            if mode == "steps":
                if re.match(r"^swaps?\s*:?$", clean, re.IGNORECASE):
                    mode = "swaps"
                    continue
                if re.match(r"^nutrition(?:\s*comparison)?\s*:?$", clean, re.IGNORECASE):
                    mode = "nutrition"
                    continue
                step = re.sub(r"^\d+[\).\s-]+", "", clean).strip()
                step = re.sub(r"^[-*•]\s*", "", step).strip()
                if step:
                    steps.append(step)
                    saw_recipe = True
                continue

            if mode == "swaps":
                if re.match(r"^nutrition(?:\s*comparison)?\s*:?$", clean, re.IGNORECASE):
                    if current_swap and (current_swap.get("original") or current_swap.get("replacement")):
                        current_swap.setdefault("reason", "healthier whole-food alternative")
                        swaps.append(current_swap)
                        current_swap = None
                    mode = "nutrition"
                    continue

                line_no_prefix = re.sub(r"^\d+[\).\s-]+", "", clean).strip()

                original_match = re.match(r"^original\s*:\s*(.+)$", line_no_prefix, re.IGNORECASE)
                if original_match:
                    if current_swap and (current_swap.get("original") or current_swap.get("replacement")):
                        current_swap.setdefault("reason", "healthier whole-food alternative")
                        swaps.append(current_swap)
                    current_swap = {"original": original_match.group(1).strip()}
                    saw_recipe = True
                    continue

                replacement_match = re.match(r"^replacement\s*:\s*(.+)$", line_no_prefix, re.IGNORECASE)
                if replacement_match:
                    if current_swap is None:
                        current_swap = {}
                    current_swap["replacement"] = replacement_match.group(1).strip()
                    saw_recipe = True
                    continue

                reason_match = re.match(r"^reason\s*:\s*(.+)$", line_no_prefix, re.IGNORECASE)
                if reason_match:
                    if current_swap is None:
                        current_swap = {}
                    current_swap["reason"] = reason_match.group(1).strip()
                    if current_swap.get("original") or current_swap.get("replacement"):
                        current_swap.setdefault("reason", "healthier whole-food alternative")
                        swaps.append(current_swap)
                        current_swap = None
                    saw_recipe = True
                    continue

                arrow_match = re.match(r"^(.+?)\s*(?:->|→)\s*(.+?)(?:\s*[—-]\s*(.+))?$", line_no_prefix)
                if arrow_match:
                    swaps.append(
                        {
                            "original": arrow_match.group(1).strip(),
                            "replacement": arrow_match.group(2).strip(),
                            "reason": (arrow_match.group(3) or "healthier whole-food alternative").strip(),
                        }
                    )
                    saw_recipe = True
                continue

            message_lines.append(clean)

        if not saw_recipe:
            return None

        if current_swap and (current_swap.get("original") or current_swap.get("replacement")):
            current_swap.setdefault("reason", "healthier whole-food alternative")
            swaps.append(current_swap)

        message = "\n".join([m for m in message_lines if m]).strip()
        if not message:
            message = "Here’s a healthified version with cleaner ingredients."

        recipe = {
            "title": title or "Healthified Recipe",
            "description": description,
            "ingredients": ingredients,
            "steps": steps,
            "prep_time_min": prep_time,
            "cook_time_min": cook_time,
            "servings": servings,
        }

        return {
            "message": message,
            "recipe": recipe,
            "swaps": swaps or None,
            "nutrition": None,
        }

    def _extract_payload(raw_text: str) -> dict:
        text = (raw_text or "").strip()

        fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
        if fence_match:
            text = fence_match.group(1).strip()
        else:
            alt_fence = re.search(r"'''(?:json)?\s*([\s\S]*?)'''", text, re.IGNORECASE)
            if alt_fence:
                text = alt_fence.group(1).strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

        normalized = text
        normalized = normalized.replace("\u201c", '"').replace("\u201d", '"').replace("\u2019", "'")
        normalized = re.sub(r'("quantity"\s*:\s*)(\d+\s*/\s*\d+)(\s*[,}])', r'\1"\2"\3', normalized)
        normalized = re.sub(r",\s*([}\]])", r"\1", normalized)

        parsed = None
        for candidate in (normalized, text):
            try:
                parsed = json.loads(candidate)
                break
            except Exception:
                continue

        if isinstance(parsed, dict):
            return {
                "message": parsed.get("message", raw_text),
                "recipe": parsed.get("recipe"),
                "swaps": parsed.get("swaps"),
                "nutrition": parsed.get("nutrition"),
            }

        markdown_payload = _parse_markdown_recipe(raw_text)
        if markdown_payload:
            return markdown_payload

        msg_match = re.search(r'"message"\s*:\s*"([\s\S]*?)"\s*,\s*"recipe"', raw_text)
        fallback_message = msg_match.group(1).replace('\\n', '\n').strip() if msg_match else raw_text
        return {
            "message": fallback_message,
            "recipe": None,
            "swaps": None,
            "nutrition": None,
        }

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

    return _extract_payload(response_text)
