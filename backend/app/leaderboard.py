from datetime import UTC, datetime

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.models import Player, ScoreEvent
from app.schemas import LeaderboardEntry, LeaderboardResponse


def get_leaderboard(db: Session, limit: int = 100) -> LeaderboardResponse:
    query = (
        select(
            Player.id.label("player_id"),
            Player.name.label("player_name"),
            func.coalesce(func.sum(ScoreEvent.delta), 0).label("total_score"),
        )
        .select_from(Player)
        .outerjoin(ScoreEvent, ScoreEvent.player_id == Player.id)
        .group_by(Player.id, Player.name)
        .order_by(desc("total_score"), Player.created_at.asc())
        .limit(limit)
    )

    rows = db.execute(query).all()
    entries = [
        LeaderboardEntry(
            player_id=row.player_id,
            player_name=row.player_name,
            total_score=row.total_score,
        )
        for row in rows
    ]

    return LeaderboardResponse(generated_at=datetime.now(UTC), entries=entries)
