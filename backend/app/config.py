from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db"
    )
    port: int = 3001
    allowed_origins: list[str] = ["*"]
    admin_reset_token: str = "reset-practice-history"
    coach_openai_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("COACH_OPENAI_API_KEY", "OPENAI_API_KEY"),
    )
    coach_openai_model: str = Field(
        default="gpt-5.2",
        validation_alias=AliasChoices("COACH_OPENAI_MODEL", "OPENAI_MODEL"),
    )
    coach_openai_base_url: str = Field(
        default="https://api.openai.com/v1",
        validation_alias=AliasChoices("COACH_OPENAI_BASE_URL", "OPENAI_BASE_URL"),
    )

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=("backend/.env", ".env"),
    )


settings = Settings()
