from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "WholeFoodLabs API"
    database_url: str = "sqlite:///./wholefoodlabs.db"
    secret_key: str = "dev-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 365
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    llm_provider: str = "gemini"  # "gemini", "openai", "anthropic", or "ollama"
    ollama_host: str = "127.0.0.1:11434"
    ollama_model: str = "qwen2.5-coder:14b"
    usda_api_key: str = ""
    spoonacular_api_key: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
