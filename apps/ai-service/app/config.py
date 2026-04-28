from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    environment: str = "development"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:4000"]

    # AI Providers
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_ai_api_key: str = ""

    # Pinecone
    pinecone_api_key: str = ""
    pinecone_environment: str = ""
    pinecone_index_name: str = "ai-copilot"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # API
    api_url: str = "http://localhost:4000"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
