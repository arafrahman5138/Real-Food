from langchain_core.language_models import BaseChatModel
from app.config import get_settings


def get_llm() -> BaseChatModel:
    settings = get_settings()
    ollama_base_url = settings.ollama_host
    if ollama_base_url and not ollama_base_url.startswith("http"):
        ollama_base_url = f"http://{ollama_base_url}"

    if settings.llm_provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model=settings.gemini_model,
            google_api_key=settings.google_api_key or settings.gemini_api_key,
            temperature=0.7,
            max_output_tokens=4096,
        )
    elif settings.llm_provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=settings.ollama_model,
            base_url=ollama_base_url,
            temperature=0.7,
        )
    elif settings.llm_provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(
            model="claude-sonnet-4-20250514",
            api_key=settings.anthropic_api_key,
            temperature=0.7,
            max_tokens=4096,
        )
    else:
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model="gpt-4o",
            api_key=settings.openai_api_key,
            temperature=0.7,
            max_tokens=4096,
        )
