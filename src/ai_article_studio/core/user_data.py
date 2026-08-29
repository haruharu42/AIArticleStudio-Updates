from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import DATA_DIR


def safe_user_scope(value: Any) -> str:
    """Return a path-safe, stable local data scope for one AAS profile."""

    text = "".join(
        character
        for character in str(value or "").strip()
        if character.isalnum() or character in {"-", "_"}
    )
    return text[:80] or "local"


@dataclass(frozen=True)
class UserDataPaths:
    scope: str
    root: Path
    article_db: Path
    workflow_state: Path
    workflow_history: Path
    article_images: Path


def user_data_paths(owner_key: Any, *, data_dir: str | Path | None = None) -> UserDataPaths:
    scope = safe_user_scope(owner_key)
    root = Path(data_dir) if data_dir is not None else DATA_DIR
    root = root / "users" / scope
    return UserDataPaths(
        scope=scope,
        root=root,
        article_db=root / "articles.db",
        workflow_state=root / "web_ai_workflow_state.json",
        workflow_history=root / "web_ai_workflow_history.json",
        article_images=root / "articles",
    )
