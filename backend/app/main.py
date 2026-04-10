from collections.abc import Sequence
from datetime import datetime, timezone
from pathlib import Path
import random
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import create_token, hash_password, require_admin, require_token, verify_admin_credentials, verify_password
from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.game_loader import load_games_from_config
from app.game_loader import get_game_clues, get_game_metadata
from app.team_loader import load_team_game_orders_from_config, load_teams_from_config, normalize_username
from app.leaderboard import get_leaderboard
from app.models import ClueAward, Game, GameSession, PerpetratorPortal, PerpetratorSubmission, Player, ScoreEvent, Team, TimerRound
from app.schemas import (
    ClueAwardResponse,
    GameCreateRequest,
    GameResponse,
    GameSessionResponse,
    GameSessionStartRequest,
    GameUpdateRequest,
    LeaderboardResponse,
    LoginRequest,
    PerpetratorPortalResponse,
    PerpetratorPortalUpdateRequest,
    PerpetratorSubmissionCreateRequest,
    PerpetratorSubmissionResponse,
    PerpetratorOptionResponse,
    PlayerCreateRequest,
    PlayerResponse,
    PlayerUpdateRequest,
    ScoreCreateRequest,
    ScoreResponse,
    TimerRoundCreateRequest,
    TimerRoundResponse,
    TeamClueGroupResponse,
    TeamPerpetratorHistoryResponse,
    TeamCreateRequest,
    TeamResponse,
    TeamUpdateRequest,
    TokenResponse,
)
from app.websocket_manager import leaderboard_connections

app = FastAPI(title="INSA Challenge Leaderboard API", version="0.1.0")
MAX_PLAYERS_PER_TEAM = 8
PERPETRATORS_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "perpetrators"
SUPPORTED_PERPETRATOR_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".avif", ".gif"}


def _build_unique_username(base_username: str, used_usernames: set[str]) -> str:
    candidate = base_username or "team"
    suffix = 1
    while candidate in used_usernames:
        suffix += 1
        candidate = f"{base_username or 'team'}_{suffix}"
    used_usernames.add(candidate)
    return candidate


def ensure_team_auth_schema() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("teams"):
        return

    column_names = {column["name"] for column in inspector.get_columns("teams")}

    with engine.begin() as connection:
        if "username" not in column_names:
            connection.execute(text("ALTER TABLE teams ADD COLUMN username VARCHAR(80)"))
        if "password_hash" not in column_names:
            connection.execute(text("ALTER TABLE teams ADD COLUMN password_hash VARCHAR(255)"))
        if "config_key" not in column_names:
            connection.execute(text("ALTER TABLE teams ADD COLUMN config_key VARCHAR(80)"))

        rows = connection.execute(
            text("SELECT id, name, username, password_hash FROM teams ORDER BY id ASC")
        ).mappings().all()

        used_usernames = {
            str(row["username"]).strip()
            for row in rows
            if row["username"] is not None and str(row["username"]).strip()
        }

        for row in rows:
            team_id = row["id"]
            current_username = str(row["username"] or "").strip()
            current_password_hash = str(row["password_hash"] or "").strip()

            updates: dict[str, str] = {}
            if not current_username:
                base_username = normalize_username(str(row["name"] or f"team_{team_id}"))
                updates["username"] = _build_unique_username(base_username, used_usernames)
            if not current_password_hash:
                updates["password_hash"] = hash_password("test1")

            if updates:
                set_clause = ", ".join(f"{key} = :{key}" for key in updates)
                connection.execute(
                    text(f"UPDATE teams SET {set_clause} WHERE id = :team_id"),
                    {**updates, "team_id": team_id},
                )

        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_teams_username_unique ON teams (username)"))
        connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_teams_config_key_unique ON teams (config_key)"))


def ensure_perpetrator_schema() -> None:
    inspector = inspect(engine)

    if inspector.has_table("perpetrator_portal"):
        portal_columns = {column["name"] for column in inspector.get_columns("perpetrator_portal")}
        with engine.begin() as connection:
            if "is_open" not in portal_columns:
                connection.execute(text("ALTER TABLE perpetrator_portal ADD COLUMN is_open BOOLEAN DEFAULT FALSE"))
            if "updated_at" not in portal_columns:
                connection.execute(text("ALTER TABLE perpetrator_portal ADD COLUMN updated_at TIMESTAMP"))

    if inspector.has_table("perpetrator_submissions"):
        submission_columns = {column["name"] for column in inspector.get_columns("perpetrator_submissions")}
        with engine.begin() as connection:
            if "perpetrator_name" not in submission_columns:
                connection.execute(text("ALTER TABLE perpetrator_submissions ADD COLUMN perpetrator_name VARCHAR(120)"))
            if "image_path" not in submission_columns:
                connection.execute(text("ALTER TABLE perpetrator_submissions ADD COLUMN image_path VARCHAR(255)"))
            if "created_at" not in submission_columns:
                connection.execute(text("ALTER TABLE perpetrator_submissions ADD COLUMN created_at TIMESTAMP"))
            connection.execute(
                text("CREATE INDEX IF NOT EXISTS ix_perpetrator_submissions_created_at ON perpetrator_submissions (created_at)")
            )

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_team_auth_schema()
    ensure_perpetrator_schema()
    with SessionLocal() as db:
        load_games_from_config(db)
        load_teams_from_config(db)


def sync_clue_awards_for_score(db: Session, team: Team, game: Game, stars: int) -> None:
    existing_awards: Sequence[ClueAward] = db.scalars(
        select(ClueAward)
        .where(ClueAward.team_id == team.id, ClueAward.game_id == game.id)
        .order_by(ClueAward.clue_order.asc(), ClueAward.id.asc())
    ).all()
    for item in existing_awards:
        db.delete(item)
    db.flush()

    if stars <= 0:
        return

    available_clues = get_game_clues(game.config_key)
    if not available_clues:
        return

    clue_count = min(stars, len(available_clues))
    if clue_count == len(available_clues):
        selected_clues = available_clues
    else:
        selected_clues = random.sample(available_clues, clue_count)

    for clue_index, clue_text in enumerate(selected_clues, start=1):
        db.add(
            ClueAward(
                team_id=team.id,
                game_id=game.id,
                clue_order=clue_index,
                clue_text=clue_text,
            )
        )


def get_or_create_perpetrator_portal(db: Session) -> PerpetratorPortal:
    portal = db.get(PerpetratorPortal, 1)
    if portal is None:
        portal = PerpetratorPortal(id=1, is_open=False)
        db.add(portal)
        db.commit()
        db.refresh(portal)
    return portal


def serialize_perpetrator_submission(item: PerpetratorSubmission, team_name: str) -> PerpetratorSubmissionResponse:
    created_at = item.created_at or datetime.now(timezone.utc)
    return PerpetratorSubmissionResponse(
        id=item.id,
        team_id=item.team_id,
        team_name=team_name,
        perpetrator_name=item.perpetrator_name,
        image_path=item.image_path,
        created_at=created_at,
    )


def build_team_perpetrator_history(db: Session, team: Team) -> TeamPerpetratorHistoryResponse:
    rows: Sequence[PerpetratorSubmission] = db.scalars(
        select(PerpetratorSubmission)
        .where(PerpetratorSubmission.team_id == team.id)
        .order_by(PerpetratorSubmission.created_at.asc(), PerpetratorSubmission.id.asc())
    ).all()

    serialized = [serialize_perpetrator_submission(item, team.name) for item in rows]
    return TeamPerpetratorHistoryResponse(
        team_id=team.id,
        team_name=team.name,
        final_choice=serialized[-1] if serialized else None,
        submissions=serialized,
    )


def list_perpetrator_options() -> list[dict[str, str | None]]:
    if not PERPETRATORS_DIR.exists() or not PERPETRATORS_DIR.is_dir():
        return []

    files = [
        file
        for file in PERPETRATORS_DIR.iterdir()
        if file.is_file() and file.suffix.lower() in SUPPORTED_PERPETRATOR_IMAGE_EXTENSIONS
    ]
    files.sort(key=lambda item: item.stem.lower())

    return [
        {
            "name": file.stem,
            "image_path": f"/perpetrators/{quote(file.name)}",
        }
        for file in files
    ]


def serialize_team(team: Team, game_orders: list[int] | None = None) -> TeamResponse:
    return TeamResponse(
        id=team.id,
        name=team.name,
        username=team.username,
        config_key=team.config_key,
        game_orders=game_orders or [],
        created_at=team.created_at,
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    # Try admin login first
    if verify_admin_credentials(payload.username, payload.password):
        token = create_token(payload.username, account_type="admin")
        return TokenResponse(access_token=token)
    
    # Try team login
    team = db.scalars(select(Team).where(Team.username == payload.username)).first()
    if team and verify_password(payload.password, team.password_hash):
        token = create_token(team.username, account_type="team")
        return TokenResponse(access_token=token)
    
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")


@app.get("/auth/me")
def get_current_user(_: tuple[str, str] = Depends(require_token)) -> dict:
    username, account_type = _
    return {"username": username, "account_type": account_type}


@app.post("/teams", response_model=TeamResponse)
def create_team(
    payload: TeamCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TeamResponse:
    cleaned_names = [name.strip() for name in payload.player_names if name.strip()]
    if len(cleaned_names) > MAX_PLAYERS_PER_TEAM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A team can have at most {MAX_PLAYERS_PER_TEAM} players",
        )
    if len(set(cleaned_names)) != len(cleaned_names):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate player names in payload")

    team_name = payload.name.strip()
    team = Team(
        name=team_name,
        username=normalize_username(team_name),
        password_hash=hash_password("test1"),
    )
    db.add(team)
    db.flush()

    for player_name in cleaned_names:
        db.add(Player(team_id=team.id, name=player_name))

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team name or username already exists",
        ) from exc

    db.refresh(team)
    return serialize_team(team, [])


@app.get("/teams", response_model=list[TeamResponse])
def list_teams(db: Session = Depends(get_db)) -> list[TeamResponse]:
    teams: Sequence[Team] = db.scalars(select(Team).order_by(Team.created_at.asc())).all()
    orders_by_config = load_team_game_orders_from_config()
    return [serialize_team(team, orders_by_config.get(team.config_key or "")) for team in teams]


@app.get("/teams/{team_id}", response_model=TeamResponse)
def get_team(team_id: int, db: Session = Depends(get_db)) -> TeamResponse:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    orders_by_config = load_team_game_orders_from_config()
    return serialize_team(team, orders_by_config.get(team.config_key or ""))


@app.put("/teams/me", response_model=TeamResponse)
def update_my_team(
    payload: TeamUpdateRequest,
    auth: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> TeamResponse:
    username, account_type = auth
    if account_type != "team":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team account required")

    team = db.scalar(select(Team).where(Team.username == username))
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    team.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Team name already exists") from exc

    db.refresh(team)
    orders_by_config = load_team_game_orders_from_config()
    return serialize_team(team, orders_by_config.get(team.config_key or ""))


@app.put("/teams/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: int,
    payload: TeamUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TeamResponse:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    team_name = payload.name.strip()
    team.name = team_name
    team.username = normalize_username(team_name)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Team name or username already exists",
        ) from exc

    db.refresh(team)
    orders_by_config = load_team_game_orders_from_config()
    return serialize_team(team, orders_by_config.get(team.config_key or ""))


@app.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    db.delete(team)
    db.commit()


@app.post("/games", response_model=GameResponse)
def create_game(
    payload: GameCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Game:
    game = Game(name=payload.name.strip())
    db.add(game)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Game already exists") from exc
    db.refresh(game)
    return game


@app.get("/games", response_model=list[GameResponse])
def list_games(db: Session = Depends(get_db)) -> list[GameResponse]:
    games: Sequence[Game] = db.scalars(select(Game).order_by(Game.created_at.asc())).all()
    return [GameResponse.model_validate(game) for game in games]


@app.put("/games/{game_id}", response_model=GameResponse)
def update_game(
    game_id: int,
    payload: GameUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Game:
    game = db.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    game.name = payload.name.strip()
    db.commit()
    db.refresh(game)
    return game


@app.delete("/games/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(
    game_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    game = db.get(Game, game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")
    db.delete(game)
    db.commit()


@app.post("/players", response_model=PlayerResponse)
def create_player(
    payload: PlayerCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Player:
    team = db.get(Team, payload.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    current_count = db.scalar(select(func.count(Player.id)).where(Player.team_id == payload.team_id)) or 0
    if current_count >= MAX_PLAYERS_PER_TEAM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A team can have at most {MAX_PLAYERS_PER_TEAM} players",
        )

    player = Player(team_id=payload.team_id, name=payload.name.strip())
    db.add(player)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Player name already exists in this team",
        ) from exc

    db.refresh(player)
    return player


@app.get("/players", response_model=list[PlayerResponse])
def list_players(
    team_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[PlayerResponse]:
    query = select(Player).order_by(Player.created_at.asc())
    if team_id is not None:
        query = query.where(Player.team_id == team_id)
    players: Sequence[Player] = db.scalars(query).all()
    return [PlayerResponse.model_validate(player) for player in players]


@app.get("/timer-rounds", response_model=list[TimerRoundResponse])
def list_timer_rounds(
    team_id: int | None = Query(default=None, ge=1),
    game_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
) -> list[TimerRoundResponse]:
    query = select(TimerRound).order_by(TimerRound.created_at.asc(), TimerRound.id.asc())
    if team_id is not None:
        query = query.where(TimerRound.team_id == team_id)
    if game_id is not None:
        query = query.where(TimerRound.game_id == game_id)
    rows: Sequence[TimerRound] = db.scalars(query).all()
    return [
        TimerRoundResponse(
            id=row.id,
            team_id=row.team_id,
            game_id=row.game_id,
            duration_milliseconds=row.duration_seconds,
            round_number=row.round_number,
            created_at=row.created_at,
        )
        for row in rows
    ]


@app.post("/timer-rounds", response_model=TimerRoundResponse)
async def create_timer_round(
    payload: TimerRoundCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> TimerRoundResponse:
    team = db.get(Team, payload.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    game = db.get(Game, payload.game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    current_round_count = db.scalar(
        select(func.count(TimerRound.id)).where(
            TimerRound.team_id == payload.team_id,
            TimerRound.game_id == payload.game_id,
        )
    ) or 0

    timer_round = TimerRound(
        team_id=payload.team_id,
        game_id=payload.game_id,
        duration_seconds=payload.duration_milliseconds,
        round_number=current_round_count + 1,
    )
    db.add(timer_round)
    db.commit()
    db.refresh(timer_round)

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))

    return TimerRoundResponse(
        id=timer_round.id,
        team_id=timer_round.team_id,
        game_id=timer_round.game_id,
        duration_milliseconds=timer_round.duration_seconds,
        round_number=timer_round.round_number,
        created_at=timer_round.created_at,
    )


@app.delete("/timer-rounds/{timer_round_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_timer_round(
    timer_round_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    timer_round = db.get(TimerRound, timer_round_id)
    if timer_round is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Timer round not found")

    team_id = timer_round.team_id
    game_id = timer_round.game_id
    db.delete(timer_round)
    db.flush()

    remaining_rounds: Sequence[TimerRound] = db.scalars(
        select(TimerRound)
        .where(TimerRound.team_id == team_id, TimerRound.game_id == game_id)
        .order_by(TimerRound.created_at.asc(), TimerRound.id.asc())
    ).all()
    for index, round_item in enumerate(remaining_rounds, start=1):
        round_item.round_number = index

    db.commit()

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))


@app.get("/players/{player_id}", response_model=PlayerResponse)
def get_player(player_id: int, db: Session = Depends(get_db)) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return player


@app.put("/players/{player_id}", response_model=PlayerResponse)
def update_player(
    player_id: int,
    payload: PlayerUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Player:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    team = db.get(Team, payload.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    if payload.team_id != player.team_id:
        current_count = db.scalar(select(func.count(Player.id)).where(Player.team_id == payload.team_id)) or 0
        if current_count >= MAX_PLAYERS_PER_TEAM:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A team can have at most {MAX_PLAYERS_PER_TEAM} players",
            )

    player.team_id = payload.team_id
    player.name = payload.name.strip()

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Player name already exists in this team",
        ) from exc

    db.refresh(player)
    return player


@app.delete("/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(
    player_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    player = db.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    db.delete(player)
    db.commit()


@app.post("/scores", response_model=ScoreResponse)
async def add_score(
    payload: ScoreCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ScoreEvent:
    team = db.get(Team, payload.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    game = db.get(Game, payload.game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    existing_scores: Sequence[ScoreEvent] = db.scalars(
        select(ScoreEvent)
        .where(ScoreEvent.team_id == payload.team_id, ScoreEvent.game_id == payload.game_id)
        .order_by(ScoreEvent.created_at.desc(), ScoreEvent.id.desc())
    ).all()

    if existing_scores:
        score_event = existing_scores[0]
        score_event.delta = payload.delta
        score_event.reason = payload.reason.strip() or "Manual update"
        for stale_score in existing_scores[1:]:
            db.delete(stale_score)
    else:
        score_event = ScoreEvent(
            team_id=payload.team_id,
            game_id=payload.game_id,
            delta=payload.delta,
            reason=payload.reason.strip() or "Manual update",
        )
        db.add(score_event)

    sync_clue_awards_for_score(db, team, game, payload.delta)

    # End any active game session for this team+game combo
    active_session = db.scalars(
        select(GameSession).where(
            GameSession.team_id == payload.team_id,
            GameSession.game_id == payload.game_id,
            GameSession.is_active == True,
        )
    ).first()
    if active_session:
        active_session.is_active = False
        active_session.ended_at = func.now()

    db.commit()
    db.refresh(score_event)

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))

    return score_event


@app.post("/games/sessions/start", response_model=GameSessionResponse)
async def start_game_session(
    payload: GameSessionStartRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GameSession:
    team = db.get(Team, payload.team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    game = db.get(Game, payload.game_id)
    if game is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    # A team can have only one active game at a time.
    active_for_team = db.scalars(
        select(GameSession).where(
            GameSession.team_id == payload.team_id,
            GameSession.is_active == True,
        )
    ).first()

    if active_for_team is not None:
        if active_for_team.game_id == payload.game_id:
            return active_for_team
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This team already has an active game session",
        )

    # Persist unlock forever by reusing one row per team+game.
    session = db.scalars(
        select(GameSession).where(
            GameSession.team_id == payload.team_id,
            GameSession.game_id == payload.game_id,
        )
    ).first()
    if session is None:
        session = GameSession(team_id=payload.team_id, game_id=payload.game_id)
        db.add(session)
    else:
        session.is_active = True
        session.ended_at = None

    db.commit()
    db.refresh(session)

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))

    return session


@app.post("/games/sessions/{session_id}/end", response_model=GameSessionResponse)
async def end_game_session(
    session_id: int,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> GameSession:
    session = db.get(GameSession, session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    session.is_active = False
    session.ended_at = func.now()
    db.commit()
    db.refresh(session)

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))

    return session


@app.get("/games/sessions/team/{team_id}", response_model=GameSessionResponse | None)
def get_team_active_session(
    team_id: int,
    _: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> GameSession | None:
    session = db.scalars(
        select(GameSession).where(
            GameSession.team_id == team_id,
            GameSession.is_active == True,
        )
    ).first()
    return session if session else None


@app.get("/games/sessions/team/{team_id}/started", response_model=list[GameSessionResponse])
def get_team_started_sessions(
    team_id: int,
    _: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> list[GameSession]:
    rows = db.scalars(
        select(GameSession)
        .where(GameSession.team_id == team_id)
        .order_by(GameSession.started_at.asc(), GameSession.id.asc())
    ).all()
    return list(rows)


@app.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(
    _: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> LeaderboardResponse:
    return get_leaderboard(db)


@app.get("/clues/me", response_model=list[TeamClueGroupResponse])
def get_my_clues(
    auth_user: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> list[TeamClueGroupResponse]:
    username, account_type = auth_user
    if account_type != "team":
        return []

    team = db.scalars(select(Team).where(Team.username == username)).first()
    if team is None:
        return []

    rows: Sequence[ClueAward] = db.scalars(
        select(ClueAward)
        .where(ClueAward.team_id == team.id)
        .order_by(ClueAward.game_id.asc(), ClueAward.clue_order.asc(), ClueAward.created_at.asc())
    ).all()

    games = db.scalars(select(Game).order_by(Game.id.asc())).all()
    completed_game_ids = {
        row.game_id
        for row in db.scalars(
            select(ScoreEvent)
            .where(ScoreEvent.team_id == team.id)
            .order_by(ScoreEvent.game_id.asc())
        ).all()
    }
    game_awards: dict[int, list[ClueAward]] = {}
    for row in rows:
        game_awards.setdefault(row.game_id, []).append(row)

    grouped: list[TeamClueGroupResponse] = []
    for game in games:
        if game.id not in completed_game_ids:
            continue
        description, motivation = get_game_metadata(game.config_key)
        awards = game_awards.get(game.id, [])
        grouped.append(
            TeamClueGroupResponse(
                game_id=game.id,
                game_name=game.name,
                completed=game.id in completed_game_ids,
                description=description,
                motivation=motivation,
                clues=[
                    ClueAwardResponse(
                        id=row.id,
                        team_id=row.team_id,
                        game_id=row.game_id,
                        game_name=game.name,
                        clue_order=row.clue_order,
                        clue_text=row.clue_text,
                        created_at=row.created_at,
                    )
                    for row in awards
                ],
            )
        )

    return grouped


@app.get("/perpetrator/portal", response_model=PerpetratorPortalResponse)
def get_perpetrator_portal(
    _: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> PerpetratorPortalResponse:
    portal = get_or_create_perpetrator_portal(db)
    options = [PerpetratorOptionResponse(**option) for option in list_perpetrator_options()]
    return PerpetratorPortalResponse(is_open=portal.is_open, updated_at=portal.updated_at, options=options)


@app.put("/perpetrator/portal", response_model=PerpetratorPortalResponse)
def update_perpetrator_portal(
    payload: PerpetratorPortalUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PerpetratorPortalResponse:
    portal = get_or_create_perpetrator_portal(db)
    portal.is_open = payload.is_open
    db.commit()
    db.refresh(portal)

    options = [PerpetratorOptionResponse(**option) for option in list_perpetrator_options()]
    return PerpetratorPortalResponse(is_open=portal.is_open, updated_at=portal.updated_at, options=options)


@app.post("/perpetrator/submissions", response_model=PerpetratorSubmissionResponse)
def submit_perpetrator_guess(
    payload: PerpetratorSubmissionCreateRequest,
    auth_user: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> PerpetratorSubmissionResponse:
    username, account_type = auth_user
    if account_type != "team":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team accounts can submit")

    team = db.scalars(select(Team).where(Team.username == username)).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    portal = get_or_create_perpetrator_portal(db)
    if not portal.is_open:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Perpetrator portal is closed")

    selected_name = payload.perpetrator_name.strip()
    if not selected_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Perpetrator name is required")

    option_by_name = {option["name"]: option for option in list_perpetrator_options()}
    option = option_by_name.get(selected_name)
    if option is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid perpetrator option")

    row = PerpetratorSubmission(
        team_id=team.id,
        perpetrator_name=selected_name,
        image_path=option.get("image_path"),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return serialize_perpetrator_submission(row, team.name)


@app.get("/perpetrator/me", response_model=TeamPerpetratorHistoryResponse)
def get_my_perpetrator_submissions(
    auth_user: tuple[str, str] = Depends(require_token),
    db: Session = Depends(get_db),
) -> TeamPerpetratorHistoryResponse:
    username, account_type = auth_user
    if account_type != "team":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only team accounts can access this route")

    team = db.scalars(select(Team).where(Team.username == username)).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    return build_team_perpetrator_history(db, team)


@app.get("/perpetrator/submissions", response_model=list[TeamPerpetratorHistoryResponse])
def get_all_perpetrator_submissions(
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[TeamPerpetratorHistoryResponse]:
    teams: Sequence[Team] = db.scalars(select(Team).order_by(Team.created_at.asc(), Team.id.asc())).all()
    return [build_team_perpetrator_history(db, team) for team in teams]


@app.websocket("/ws/leaderboard")
async def leaderboard_ws(
    websocket: WebSocket,
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> None:
    # Note: For WebSocket, we need to manually validate the token
    import jwt
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing token")
        return
    
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        username = payload.get("sub")
        if not username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token")
        return
    
    await leaderboard_connections.connect(websocket)

    try:
        snapshot = get_leaderboard(db)
        await websocket.send_json(snapshot.model_dump(mode="json"))

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        leaderboard_connections.disconnect(websocket)
    except Exception:
        leaderboard_connections.disconnect(websocket)
