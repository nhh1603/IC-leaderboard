from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Game

GAMES_DIR = Path(__file__).parent.parent / "games"


def load_games_from_config(db: Session) -> None:
    """
    Upsert games from YAML config files in the games/ directory.
    Each file becomes one game. config_key = filename stem (e.g. "game1").
    Runs on every startup so renaming a YAML name field is reflected on restart.
    Manually created games (config_key=None) are never touched.
    """
    if not GAMES_DIR.exists():
        return

    for config_file in sorted(GAMES_DIR.glob("*.yaml")):
        config_key = config_file.stem
        try:
            data = yaml.safe_load(config_file.read_text(encoding="utf-8")) or {}
        except Exception:
            continue

        name = str(data.get("name", config_key)).strip()
        existing = db.scalars(select(Game).where(Game.config_key == config_key)).first()
        if existing:
            existing.name = name
        else:
            db.add(Game(name=name, config_key=config_key))

    db.commit()
