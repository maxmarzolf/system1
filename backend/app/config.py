from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql://flashcard_user:flashcard_password@localhost:5432/flashcard_db"
    )
    port: int = 3001
    allowed_origins: list[str] = ["*"]

    model_config = {"env_prefix": ""}


settings = Settings()
