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
    pinecone_index_name: str = "nexus-ai"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # AWS
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_s3_bucket: str = ""

    # Internal API URL (for status callbacks)
    api_url: str = "http://localhost:4000"
    internal_secret: str = "dev-internal-secret"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
