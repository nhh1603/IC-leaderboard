from collections.abc import Sequence

from fastapi import Depends, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import create_token, require_admin, verify_admin_credentials
from app.config import settings
from app.database import Base, engine, get_db
from app.leaderboard import get_leaderboard
from app.models import Player, ScoreEvent
from app.schemas import (
    LeaderboardResponse,
    LoginRequest,
    PlayerCreateRequest,
    PlayerResponse,
    ScoreCreateRequest,
    ScoreResponse,
    TokenResponse,
)
from app.websocket_manager import leaderboard_connections

app = FastAPI(title="INSA Challenge Leaderboard API", version="0.1.0")

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    if not verify_admin_credentials(payload.username, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_token(payload.username)
    return TokenResponse(access_token=token)


@app.post("/players", response_model=PlayerResponse)
def create_player(
    payload: PlayerCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Player:
    player = Player(name=payload.name.strip())
    db.add(player)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Player name already exists") from exc

    db.refresh(player)
    return player


@app.get("/players", response_model=list[PlayerResponse])
def list_players(db: Session = Depends(get_db)) -> list[PlayerResponse]:
    players: Sequence[Player] = db.scalars(select(Player).order_by(Player.created_at.asc())).all()
    return [PlayerResponse.model_validate(player) for player in players]


@app.post("/scores", response_model=ScoreResponse)
async def add_score(
    payload: ScoreCreateRequest,
    _: str = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ScoreEvent:
    player = db.get(Player, payload.player_id)
    if player is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    score_event = ScoreEvent(
        player_id=payload.player_id,
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
def leaderboard(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> LeaderboardResponse:
    return get_leaderboard(db, limit=limit)


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
