from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./leaderboard.db"
    admin_username: str = "admin"
    admin_password: str = "change-me"
    jwt_secret: str = "replace-with-a-long-random-secret"
    jwt_expires_minutes: int = 120
    cors_origins: str = "http://localhost:5173,https://avi-ic-leaderboard.vercel.app"
    cors_origin_regex: str = r"^https://.*\.vercel\.app$"


settings = Settings()
