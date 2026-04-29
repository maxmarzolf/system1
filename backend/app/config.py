from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = (
        "postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db"
    )
    port: int = 3001
    allowed_origins: list[str] = ["*"]
    admin_reset_token: str = "reset-practice-history"
    coach_llm_provider: str = Field(
        default="openai",
        validation_alias=AliasChoices("COACH_LLM_PROVIDER"),
    )
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
    coach_anthropic_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("COACH_ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY"),
    )
    coach_anthropic_model: str = Field(
        default="claude-sonnet-4-6",
        validation_alias=AliasChoices("COACH_ANTHROPIC_MODEL"),
    )
    coach_anthropic_base_url: str = Field(
        default="https://api.anthropic.com/v1",
        validation_alias=AliasChoices("COACH_ANTHROPIC_BASE_URL"),
    )
    coach_gemma_api_key: str = Field(
        default="",
        validation_alias=AliasChoices("COACH_GEMMA_API_KEY"),
    )
    coach_gemma_model: str = Field(
        default="gemma-4-31b-it",
        validation_alias=AliasChoices("COACH_GEMMA_MODEL"),
    )
    coach_gemma_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        validation_alias=AliasChoices("COACH_GEMMA_BASE_URL"),
    )
    coach_generator_max_tokens: int = Field(
        default=8000,
        validation_alias=AliasChoices("COACH_GENERATOR_MAX_TOKENS"),
    )
    coach_generator_timeout_seconds: int = Field(
        default=90,
        validation_alias=AliasChoices("COACH_GENERATOR_TIMEOUT_SECONDS"),
    )
    coach_generator_temperature: float = Field(
        default=0.7,
        validation_alias=AliasChoices("COACH_GENERATOR_TEMPERATURE"),
    )
    coach_generator_readiness_threshold: float = Field(
        default=90.0,
        validation_alias=AliasChoices("COACH_GENERATOR_READINESS_THRESHOLD"),
    )
    coach_generator_prompt_words: int = Field(
        default=12,
        validation_alias=AliasChoices("COACH_GENERATOR_PROMPT_WORDS"),
    )
    coach_generator_prompt_max_chars: int = Field(
        default=80,
        validation_alias=AliasChoices("COACH_GENERATOR_PROMPT_MAX_CHARS"),
    )
    coach_generator_pattern_history_limit: int = Field(
        default=0,
        validation_alias=AliasChoices("COACH_GENERATOR_PATTERN_HISTORY_LIMIT"),
    )

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=("backend/.env", ".env"),
        extra="ignore",
    )


settings = Settings()
