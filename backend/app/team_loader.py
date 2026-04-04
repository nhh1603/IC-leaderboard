from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import hash_password
from app.models import Team, Player

TEAMS_DIR = Path(__file__).parent.parent / "teams"


def normalize_username(name: str) -> str:
    """Normalize team name to username (lowercase, replace spaces with underscores)."""
    return name.strip().lower().replace(" ", "_").replace("-", "_")


def load_teams_from_config(db: Session) -> None:
    """
    Upsert teams from YAML config files in the teams/ directory.
    Each file becomes one team. config_key = filename stem (e.g. "team1").
    Runs on every startup so renaming a YAML config is reflected on restart.
    Manually created teams (config_key=None) are never touched.
    
    YAML structure:
    name: "Team Name"
    members: ["Player 1", "Player 2", ...]
    username: "team_name"
    password: "test1"
    """
    if not TEAMS_DIR.exists():
        return

    for config_file in sorted(TEAMS_DIR.glob("*.yaml")):
        config_key = config_file.stem
        try:
            data = yaml.safe_load(config_file.read_text(encoding="utf-8")) or {}
        except Exception:
            continue

        name = str(data.get("name", config_key)).strip()
        members = data.get("members", [])
        password = str(data.get("password", "test1")).strip()
        username = str(data.get("username") or normalize_username(name)).strip()

        password_hash = hash_password(password)

        existing = db.scalars(select(Team).where(Team.config_key == config_key)).first()
        if existing:
            existing.name = name
            existing.username = username
            existing.password_hash = password_hash
            existing.players.clear()
            db.flush()
            for member_name in members:
                if member_name.strip():
                    db.add(Player(team_id=existing.id, name=member_name.strip()))
        else:
            team = Team(name=name, username=username, password_hash=password_hash, config_key=config_key)
            db.add(team)
            db.flush()

            for member_name in members:
                if member_name.strip():
                    db.add(Player(team_id=team.id, name=member_name.strip()))

    db.commit()
