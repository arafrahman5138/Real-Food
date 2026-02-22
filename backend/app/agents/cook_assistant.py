from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.llm_provider import get_llm

SYSTEM_PROMPT = """You are a friendly cooking assistant at WholeFoodLabs. You help users through 
recipes step by step. When asked about a cooking step, provide:
- Clear, detailed instructions
- Tips for success
- Common mistakes to avoid
- Timing guidance

Keep responses concise and encouraging. If the user asks about substitutions or modifications, 
always suggest whole-food alternatives."""


async def get_cooking_help(recipe: dict, step_number: int, question: str = "") -> str:
    llm = get_llm()
    steps = recipe.get("steps", [])
    current_step = steps[step_number] if step_number < len(steps) else "Final step"

    user_msg = f"""Recipe: {recipe.get('title', 'Unknown')}
Current step ({step_number + 1}/{len(steps)}): {current_step}
Ingredients: {', '.join(i.get('name', '') for i in recipe.get('ingredients', []))}

{"User question: " + question if question else "Please provide guidance for this step."}"""

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_msg),
    ]

    response = await llm.ainvoke(messages)
    return response.content
