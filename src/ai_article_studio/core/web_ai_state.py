from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import tempfile
from typing import Any
from uuid import uuid4

from .image_settings import normalize_image_settings


STATE_SCHEMA_VERSION = 3
DEFAULT_STEP = "00"
VALID_STEPS = {"00", "01", "02", "03", "04", "05"}
DEFAULT_HISTORY_LIMIT = 10


def default_state_path() -> Path:
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        base = Path(local_app_data) / "AIArticleStudio" / "data"
    else:
        base = Path.home() / ".ai_article_studio" / "data"
    return base / "web_ai_workflow_state.json"


def default_history_path() -> Path:
    return default_state_path().with_name("web_ai_workflow_history.json")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _safe_step(value: Any) -> str:
    step = str(value or DEFAULT_STEP)
    return step if step in VALID_STEPS else DEFAULT_STEP


@dataclass
class WebAIWorkflowState:
    schema_version: int = STATE_SCHEMA_VERSION
    article_id: str = ""
    current_step: str = DEFAULT_STEP
    generation_method: str = "web"
    provider: str = "ChatGPT"
    quality: str = "標準"
    model_label: str = ""
    article_request: dict[str, Any] = field(default_factory=dict)
    title_prompt: str = ""
    title_response_raw: str = ""
    title_candidates: list[str] = field(default_factory=list)
    selected_title: str = ""
    final_prompt: str = ""
    raw_web_output: str = ""
    normalized_output: str = ""
    formatted_output: str = ""
    repair_warnings: list[str] = field(default_factory=list)
    repair_history: list[dict[str, Any]] = field(default_factory=list)
    publish_platform: str = "note"
    image_settings: dict[str, Any] = field(default_factory=dict)
    image_assets_meta: dict[str, Any] = field(default_factory=dict)
    gpu_diagnostic: dict[str, Any] = field(default_factory=dict)
    is_completed: bool = False
    updated_at: str = field(default_factory=_utc_now_iso)

    def normalize(self) -> "WebAIWorkflowState":
        self.schema_version = STATE_SCHEMA_VERSION
        self.current_step = _safe_step(self.current_step)
        self.generation_method = str(self.generation_method or "web")
        self.provider = str(self.provider or "ChatGPT")
        self.quality = str(self.quality or "標準")
        self.model_label = str(self.model_label or "")
        self.article_request = dict(self.article_request or {})
        self.title_candidates = [str(x).strip() for x in (self.title_candidates or []) if str(x).strip()]
        self.repair_warnings = [str(x) for x in (self.repair_warnings or []) if str(x)]
        self.repair_history = [dict(x) for x in (self.repair_history or []) if isinstance(x, dict)]
        self.publish_platform = str(self.publish_platform or self.article_request.get("platform") or "note")
        self.image_settings = normalize_image_settings(self.image_settings).to_dict()
        self.image_assets_meta = dict(self.image_assets_meta or {})
        self.gpu_diagnostic = dict(self.gpu_diagnostic or {})
        self.updated_at = str(self.updated_at or _utc_now_iso())
        return self

    def touch(self) -> None:
        self.updated_at = _utc_now_iso()

    def to_dict(self) -> dict[str, Any]:
        self.normalize()
        return asdict(self)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "WebAIWorkflowState":
        if not isinstance(payload, dict):
            raise ValueError("state payload must be an object")
        known = {name for name in cls.__dataclass_fields__}
        values = {key: value for key, value in payload.items() if key in known}
        state = cls(**values)
        return state.normalize()

    @property
    def can_resume(self) -> bool:
        meaningful = any(
            [
                self.article_request,
                self.title_candidates,
                self.selected_title,
                self.raw_web_output.strip(),
                self.normalized_output.strip(),
                self.formatted_output.strip(),
            ]
        )
        return meaningful and not self.is_completed

    @property
    def resume_label(self) -> str:
        title = self.selected_title.strip()
        if not title:
            title = str(self.article_request.get("theme") or self.article_request.get("genre") or "作成中の記事")
        return f"{title}（STEP {self.current_step} から続ける）"

    @property
    def history_title(self) -> str:
        title = self.selected_title.strip()
        if title:
            return title
        for key in ("theme", "genre", "subgenre"):
            value = str(self.article_request.get(key) or "").strip()
            if value:
                return value
        return "新しい記事"

    @property
    def history_status(self) -> str:
        return "完成" if self.is_completed else "作成中"

    @property
    def is_meaningful(self) -> bool:
        return any(
            [
                self.article_request,
                self.title_prompt.strip(),
                self.title_candidates,
                self.selected_title.strip(),
                self.final_prompt.strip(),
                self.raw_web_output.strip(),
                self.normalized_output.strip(),
                self.formatted_output.strip(),
            ]
        )


def _atomic_write_json(path: Path, payload: Any) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=str(path.parent))
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)
    return path


class WebAIStateStore:
    def __init__(
        self,
        path: str | Path | None = None,
        *,
        history_path: str | Path | None = None,
        history_limit: int = DEFAULT_HISTORY_LIMIT,
    ):
        self.path = Path(path) if path else default_state_path()
        self.history_path = Path(history_path) if history_path else self.path.with_name("web_ai_workflow_history.json")
        self.history_limit = max(1, min(int(history_limit or DEFAULT_HISTORY_LIMIT), 50))

    def _load_history_payload(self) -> list[dict[str, Any]]:
        if not self.history_path.exists():
            return []
        try:
            payload = json.loads(self.history_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return []
        rows = payload.get("items", []) if isinstance(payload, dict) else payload
        return [dict(item) for item in rows if isinstance(item, dict)]

    def _save_history_payload(self, rows: list[dict[str, Any]]) -> Path:
        return _atomic_write_json(
            self.history_path,
            {"schema_version": STATE_SCHEMA_VERSION, "limit": self.history_limit, "items": rows[: self.history_limit]},
        )

    def _record_history(self, state: WebAIWorkflowState) -> None:
        if not state.is_meaningful:
            return
        rows = [item for item in self._load_history_payload() if str(item.get("article_id") or "") != state.article_id]
        rows.insert(0, state.to_dict())
        self._save_history_payload(rows)

    def save(self, state: WebAIWorkflowState) -> Path:
        if not state.article_id:
            state.article_id = uuid4().hex
        state.touch()
        payload = state.to_dict()
        _atomic_write_json(self.path, payload)
        self._record_history(state)
        return self.path

    def load(self) -> WebAIWorkflowState | None:
        if not self.path.exists():
            return None
        try:
            payload = json.loads(self.path.read_text(encoding="utf-8"))
            return WebAIWorkflowState.from_dict(payload)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            return None

    def clear(self) -> bool:
        if not self.path.exists():
            return False
        self.path.unlink()
        return True

    def recent(self, limit: int = DEFAULT_HISTORY_LIMIT) -> list[WebAIWorkflowState]:
        result: list[WebAIWorkflowState] = []
        for payload in self._load_history_payload()[: max(1, min(int(limit or DEFAULT_HISTORY_LIMIT), self.history_limit))]:
            try:
                result.append(WebAIWorkflowState.from_dict(payload))
            except (TypeError, ValueError):
                continue
        return result

    def recent_summaries(self, limit: int = DEFAULT_HISTORY_LIMIT) -> list[dict[str, Any]]:
        return [
            {
                "article_id": state.article_id,
                "title": state.history_title,
                "status": state.history_status,
                "step": state.current_step,
                "platform": state.publish_platform,
                "updated_at": state.updated_at,
            }
            for state in self.recent(limit)
        ]

    def load_history(self, article_id: str) -> WebAIWorkflowState | None:
        wanted = str(article_id or "").strip()
        for state in self.recent(self.history_limit):
            if state.article_id == wanted:
                self.save(state)
                return state
        return None

    def delete_history(self, article_id: str) -> bool:
        wanted = str(article_id or "").strip()
        rows = self._load_history_payload()
        kept = [item for item in rows if str(item.get("article_id") or "") != wanted]
        if len(kept) == len(rows):
            return False
        self._save_history_payload(kept)
        current = self.load()
        if current and current.article_id == wanted:
            self.clear()
        return True

    def start_new(self, *, generation_method: str = "web") -> WebAIWorkflowState:
        current = self.load()
        if current and current.is_meaningful:
            self.save(current)
        state = WebAIWorkflowState(article_id=uuid4().hex, generation_method=generation_method)
        _atomic_write_json(self.path, state.to_dict())
        return state

    def clear_article_content(self) -> WebAIWorkflowState:
        state = self.load() or WebAIWorkflowState(article_id=uuid4().hex)
        state.raw_web_output = ""
        state.normalized_output = ""
        state.formatted_output = ""
        state.repair_warnings = []
        state.image_assets_meta = {}
        state.is_completed = False
        if state.current_step in {"04", "05"}:
            state.current_step = "03"
        self.save(state)
        return state

    def mark_completed(self, state: WebAIWorkflowState) -> Path:
        state.is_completed = True
        state.current_step = "05"
        return self.save(state)


def update_state(
    state: WebAIWorkflowState,
    *,
    current_step: str | None = None,
    article_request: dict[str, Any] | None = None,
    provider: str | None = None,
    quality: str | None = None,
    model_label: str | None = None,
    title_candidates: list[str] | None = None,
    selected_title: str | None = None,
    title_prompt: str | None = None,
    title_response_raw: str | None = None,
    final_prompt: str | None = None,
    raw_web_output: str | None = None,
    normalized_output: str | None = None,
    formatted_output: str | None = None,
    repair_warnings: list[str] | None = None,
    publish_platform: str | None = None,
    image_settings: dict[str, Any] | None = None,
    image_assets_meta: dict[str, Any] | None = None,
    gpu_diagnostic: dict[str, Any] | None = None,
) -> WebAIWorkflowState:
    if current_step is not None:
        state.current_step = _safe_step(current_step)
    if article_request is not None:
        state.article_request = dict(article_request)
    if provider is not None:
        state.provider = provider
    if quality is not None:
        state.quality = quality
    if model_label is not None:
        state.model_label = model_label
    if title_candidates is not None:
        state.title_candidates = list(title_candidates)
    if selected_title is not None:
        state.selected_title = selected_title
    if title_prompt is not None:
        state.title_prompt = title_prompt
    if title_response_raw is not None:
        state.title_response_raw = title_response_raw
    if final_prompt is not None:
        state.final_prompt = final_prompt
    if raw_web_output is not None:
        state.raw_web_output = raw_web_output
    if normalized_output is not None:
        state.normalized_output = normalized_output
    if formatted_output is not None:
        state.formatted_output = formatted_output
    if repair_warnings is not None:
        state.repair_warnings = list(repair_warnings)
    if publish_platform is not None:
        state.publish_platform = publish_platform
    if image_settings is not None:
        state.image_settings = normalize_image_settings(image_settings).to_dict()
    if image_assets_meta is not None:
        state.image_assets_meta = dict(image_assets_meta)
    if gpu_diagnostic is not None:
        state.gpu_diagnostic = dict(gpu_diagnostic)
    state.is_completed = False
    state.touch()
    return state.normalize()


def record_repair(state: WebAIWorkflowState, repair_type: str, *, status: str = "copied") -> None:
    state.repair_history.append(
        {
            "repair_type": str(repair_type),
            "status": str(status),
            "recorded_at": _utc_now_iso(),
        }
    )
    state.touch()
