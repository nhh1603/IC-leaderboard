from collections.abc import Sequence

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import create_token, require_admin, verify_admin_credentials
from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.game_loader import load_games_from_config
from app.leaderboard import get_leaderboard
from app.models import Game, Player, ScoreEvent, Team
from app.schemas import (
    GameCreateRequest,
    GameResponse,
    GameUpdateRequest,
    LeaderboardResponse,
    LoginRequest,
    PlayerCreateRequest,
    PlayerResponse,
    PlayerUpdateRequest,
    ScoreCreateRequest,
    ScoreResponse,
    TeamCreateRequest,
    TeamResponse,
    TeamUpdateRequest,
    TokenResponse,
)
from app.websocket_manager import leaderboard_connections

app = FastAPI(title="INSA Challenge Leaderboard API", version="0.1.0")
MAX_PLAYERS_PER_TEAM = 8

origins = [origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        load_games_from_config(db)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_token(payload.username)
    return TokenResponse(access_token=token)


@app.post("/teams", response_model=TeamResponse)
def create_team(
    payload: TeamCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Team:
    cleaned_names = [name.strip() for name in payload.player_names if name.strip()]
    if len(cleaned_names) > MAX_PLAYERS_PER_TEAM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A team can have at most {MAX_PLAYERS_PER_TEAM} players",
        )
    if len(set(cleaned_names)) != len(cleaned_names):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate player names in payload")

    team = Team(name=payload.name.strip())
    db.add(team)
    db.flush()

    for player_name in cleaned_names:
        db.add(Player(team_id=team.id, name=player_name))

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Team name already exists") from exc

    db.refresh(team)
    return team


@app.get("/teams", response_model=list[TeamResponse])
def list_teams(db: Session = Depends(get_db)) -> list[TeamResponse]:
    teams: Sequence[Team] = db.scalars(select(Team).order_by(Team.created_at.asc())).all()
    return [TeamResponse.model_validate(team) for team in teams]


@app.get("/teams/{team_id}", response_model=TeamResponse)
def get_team(team_id: int, db: Session = Depends(get_db)) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


@app.put("/teams/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: int,
    payload: TeamUpdateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Team:
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    team.name = payload.name.strip()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Team name already exists") from exc

    db.refresh(team)
    return team


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

    db.commit()
    db.refresh(score_event)

    leaderboard = get_leaderboard(db)
    await leaderboard_connections.broadcast_json(leaderboard.model_dump(mode="json"))

    return score_event


@app.get("/leaderboard", response_model=LeaderboardResponse)
def leaderboard(db: Session = Depends(get_db)) -> LeaderboardResponse:
    return get_leaderboard(db)


@app.websocket("/ws/leaderboard")
async def leaderboard_ws(websocket: WebSocket, db: Session = Depends(get_db)) -> None:
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
