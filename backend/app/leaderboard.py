from datetime import UTC, datetime

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from app.models import Game, ScoreEvent, Team, TimerRound
from app.schemas import GameLeaderboard, LeaderboardEntry, LeaderboardResponse, RoundTimeDetail


def get_leaderboard(db: Session) -> LeaderboardResponse:
    games = db.scalars(select(Game).order_by(Game.created_at.asc())).all()
    game_boards: list[GameLeaderboard] = []

    for game in games:
        timer_rows = db.scalars(
            select(TimerRound)
            .where(TimerRound.game_id == game.id)
            .order_by(TimerRound.created_at.asc(), TimerRound.id.asc())
        ).all()

        rounds_by_team: dict[int, list[RoundTimeDetail]] = {}
        total_time_by_team: dict[int, int] = {}
        for row in timer_rows:
            rounds_by_team.setdefault(row.team_id, []).append(
                RoundTimeDetail(round_number=row.round_number, duration_milliseconds=row.duration_seconds)
            )
            total_time_by_team[row.team_id] = total_time_by_team.get(row.team_id, 0) + row.duration_seconds

        query = (
            select(
                Team.id.label("team_id"),
                Team.name.label("team_name"),
                func.coalesce(func.sum(ScoreEvent.delta), 0).label("total_score"),
            )
            .select_from(Team)
            .outerjoin(
                ScoreEvent,
                and_(ScoreEvent.team_id == Team.id, ScoreEvent.game_id == game.id),
            )
            .group_by(Team.id, Team.name)
            .order_by(desc("total_score"), Team.created_at.asc())
        )
        rows = db.execute(query).all()
        entries = [
            LeaderboardEntry(
                team_id=r.team_id,
                team_name=r.team_name,
                total_score=r.total_score,
                total_time_milliseconds=total_time_by_team.get(r.team_id, 0),
                time_rounds=rounds_by_team.get(r.team_id, []),
            )
            for r in rows
        ]
        game_boards.append(GameLeaderboard(game_id=game.id, game_name=game.name, entries=entries))

    return LeaderboardResponse(generated_at=datetime.now(UTC), games=game_boards)
