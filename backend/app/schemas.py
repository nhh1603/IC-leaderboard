from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class PlayerCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class PlayerResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class ScoreCreateRequest(BaseModel):
    player_id: int
    delta: int = Field(ge=-10000, le=10000)
    reason: str = Field(default="Manual update", max_length=200)


class ScoreResponse(BaseModel):
    id: int
    player_id: int
    delta: int
    reason: str
    created_at: datetime

    class Config:
        from_attributes = True


class LeaderboardEntry(BaseModel):
    player_id: int
    player_name: str
    total_score: int


class LeaderboardResponse(BaseModel):
    generated_at: datetime
    entries: list[LeaderboardEntry]
