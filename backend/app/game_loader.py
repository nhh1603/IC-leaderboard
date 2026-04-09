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


def get_game_clues(config_key: str | None) -> list[str]:
    """Read a game's clues from YAML config. Returns up to 3 non-empty clues."""
    if not config_key:
        return []

    config_file = GAMES_DIR / f"{config_key}.yaml"
    if not config_file.exists():
        return []

    try:
        data = yaml.safe_load(config_file.read_text(encoding="utf-8")) or {}
    except Exception:
        return []

    raw_clues = data.get("clues", [])
    if not isinstance(raw_clues, list):
        return []

    cleaned = [str(clue).strip() for clue in raw_clues if str(clue).strip()]
    return cleaned[:3]


def get_game_metadata(config_key: str | None) -> tuple[str, str]:
    """Read description/motivation for a game from YAML config."""
    if not config_key:
        return "", ""

    config_file = GAMES_DIR / f"{config_key}.yaml"
    if not config_file.exists():
        return "", ""

    try:
        data = yaml.safe_load(config_file.read_text(encoding="utf-8")) or {}
    except Exception:
        return "", ""

    # Keep backward compatibility with existing misspelled key in YAML files.
    description = str(data.get("description") or data.get("desciption") or "").strip()
    motivation = str(data.get("motivation") or "").strip()
    return description, motivation
