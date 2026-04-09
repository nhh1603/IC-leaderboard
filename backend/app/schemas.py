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
    username: str | None = None
    config_key: str | None = None
    game_orders: list[int] = Field(default_factory=list)
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


class ClueAwardResponse(BaseModel):
    id: int
    team_id: int
    game_id: int
    game_name: str
    clue_order: int
    clue_text: str
    created_at: datetime


class TeamClueGroupResponse(BaseModel):
    game_id: int
    game_name: str
    completed: bool
    description: str
    motivation: str
    clues: list[ClueAwardResponse]


class TimerRoundCreateRequest(BaseModel):
    team_id: int
    game_id: int
    duration_milliseconds: int = Field(ge=0, le=86_400_000)


class TimerRoundResponse(BaseModel):
    id: int
    team_id: int
    game_id: int
    duration_milliseconds: int
    round_number: int
    created_at: datetime

    class Config:
        from_attributes = True


class RoundTimeDetail(BaseModel):
    round_number: int
    duration_milliseconds: int
    game_name: str | None = None


class LeaderboardEntry(BaseModel):
    team_id: int
    team_name: str
    total_score: int
    total_time_milliseconds: int = 0
    time_rounds: list[RoundTimeDetail] = Field(default_factory=list)


class GameLeaderboard(BaseModel):
    game_id: int
    game_name: str
    entries: list[LeaderboardEntry]


class LeaderboardResponse(BaseModel):
    generated_at: datetime
    games: list[GameLeaderboard]


class GameSessionStartRequest(BaseModel):
    team_id: int
    game_id: int


class GameSessionResponse(BaseModel):
    id: int
    team_id: int
    game_id: int
    is_active: bool
    started_at: datetime
    ended_at: datetime | None

    class Config:
        from_attributes = True


class PerpetratorOptionResponse(BaseModel):
    name: str
    image_path: str | None = None


class PerpetratorPortalUpdateRequest(BaseModel):
    is_open: bool


class PerpetratorPortalResponse(BaseModel):
    is_open: bool
    updated_at: datetime
    options: list[PerpetratorOptionResponse]


class PerpetratorSubmissionCreateRequest(BaseModel):
    perpetrator_name: str = Field(min_length=1, max_length=120)


class PerpetratorSubmissionResponse(BaseModel):
    id: int
    team_id: int
    team_name: str
    perpetrator_name: str
    image_path: str | None = None
    created_at: datetime


class TeamPerpetratorHistoryResponse(BaseModel):
    team_id: int
    team_name: str
    final_choice: PerpetratorSubmissionResponse | None = None
    submissions: list[PerpetratorSubmissionResponse]
