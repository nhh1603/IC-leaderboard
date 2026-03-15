from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class GameCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class GameUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class GameResponse(BaseModel):
    id: int
    name: str
    config_key: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    player_names: list[str] = Field(default_factory=list)


class TeamUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class TeamResponse(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class PlayerCreateRequest(BaseModel):
    team_id: int
    name: str = Field(min_length=1, max_length=80)


class PlayerUpdateRequest(BaseModel):
    team_id: int
    name: str = Field(min_length=1, max_length=80)


class PlayerResponse(BaseModel):
    id: int
    team_id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class ScoreCreateRequest(BaseModel):
    team_id: int
    game_id: int
    delta: int = Field(ge=0, le=3)
    reason: str = Field(default="Manual update", max_length=200)


class ScoreResponse(BaseModel):
    id: int
    team_id: int
    game_id: int
    delta: int
    reason: str
    created_at: datetime

    class Config:
        from_attributes = True


class LeaderboardEntry(BaseModel):
    team_id: int
    team_name: str
    total_score: int


class GameLeaderboard(BaseModel):
    game_id: int
    game_name: str
    entries: list[LeaderboardEntry]


class LeaderboardResponse(BaseModel):
    generated_at: datetime
    games: list[GameLeaderboard]
