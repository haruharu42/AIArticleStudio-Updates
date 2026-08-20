from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from typing import Any, Mapping


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_article_image_root() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        base = Path(local_app_data) / "AIArticleStudio" / "data" / "articles"
    else:
        base = Path.home() / ".ai_article_studio" / "data" / "articles"
    return base


def safe_article_id(value: Any) -> str:
    text = "".join(ch for ch in str(value or "").strip() if ch.isalnum() or ch in {"-", "_"})
    return text[:80] or "draft"


@dataclass
class ArticleImageAsset:
    id: str
    article_id: str
    role: str
    source_mode: str = "web"
    provider: str = ""
    model_label: str = ""
    prompt: str = ""
    position: str = ""
    description: str = ""
    original_file_path: str = ""
    rendered_file_path: str = ""
    alt_text: str = ""
    caption: str = ""
    status: str = "prompt_ready"
    created_at: str = field(default_factory=_utc_now_iso)
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class ArticleImageStore:
    """Small sidecar store for article-image metadata.

    It intentionally stores metadata only. Web-generated image files are imported
    by later UI actions and should be copied into the managed article directory
    rather than referenced only from an arbitrary original path.
    """

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root else default_article_image_root()

    def article_dir(self, article_id: Any) -> Path:
        return self.root / safe_article_id(article_id) / "images"

    def metadata_path(self, article_id: Any) -> Path:
        return self.article_dir(article_id) / "image_assets.json"

    def save_payload(self, article_id: Any, payload: Mapping[str, Any]) -> Path:
        path = self.metadata_path(article_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = dict(payload or {})
        data["article_id"] = safe_article_id(article_id)
        data["updated_at"] = _utc_now_iso()
        fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
        tmp = Path(tmp_name)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
                json.dump(data, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)
        return path

    def load_payload(self, article_id: Any) -> dict[str, Any]:
        path = self.metadata_path(article_id)
        if not path.is_file():
            return {}
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            return dict(value) if isinstance(value, dict) else {}
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return {}
