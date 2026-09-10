from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
from typing import Any, Mapping
from uuid import uuid4


MAX_IMAGE_BYTES = 10 * 1024 * 1024
MANAGED_ASSETS_KEY = "managed_assets"
SUPPORTED_IMAGES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


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
    """Per-article image files and forward-compatible sidecar metadata.

    Phase 5C always copies a selected file into this managed directory before a
    network operation.  Unknown sidecar fields (including the Phase 4 prompt
    plan) are preserved, and signed URLs are deliberately never persisted.
    """

    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root else default_article_image_root()
        self._lock = threading.RLock()

    def article_dir(self, article_id: Any) -> Path:
        return self.root / safe_article_id(article_id) / "images"

    def metadata_path(self, article_id: Any) -> Path:
        return self.article_dir(article_id) / "image_assets.json"

    def save_payload(self, article_id: Any, payload: Mapping[str, Any]) -> Path:
        with self._lock:
            return self._save_payload(article_id, payload)

    def _save_payload(self, article_id: Any, payload: Mapping[str, Any]) -> Path:
        path = self.metadata_path(article_id)
        self._require_inside_root(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = dict(payload or {})
        # Legacy prompt generation replaces the prompt payload wholesale.
        # Never let that operation discard Phase 5C's file/cloud lifecycle.
        existing = self._load_payload(article_id)
        if MANAGED_ASSETS_KEY in existing and MANAGED_ASSETS_KEY not in data:
            data[MANAGED_ASSETS_KEY] = existing[MANAGED_ASSETS_KEY]
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
        with self._lock:
            return self._load_payload(article_id)

    def _load_payload(self, article_id: Any) -> dict[str, Any]:
        path = self.metadata_path(article_id)
        if not path.is_file():
            return {}
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            return dict(value) if isinstance(value, dict) else {}
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            return {}

    def list_managed_assets(
        self,
        article_id: Any,
        *,
        include_deleted: bool = False,
    ) -> list[dict[str, Any]]:
        payload = self.load_payload(article_id)
        values = payload.get(MANAGED_ASSETS_KEY)
        if not isinstance(values, list):
            return []
        result = [dict(item) for item in values if isinstance(item, Mapping)]
        if not include_deleted:
            result = [item for item in result if item.get("desired_state") != "delete"]
        return result

    def add_managed_asset(
        self,
        article_id: Any,
        source_path: str | Path,
        *,
        asset_type: str,
        sort_order: int = 0,
        insertion_marker: str | None = None,
        alt_text: str = "",
    ) -> dict[str, Any]:
        """Validate by file signature, copy locally, and replace the same slot."""

        with self._lock:
            return self._add_managed_asset(
                article_id,
                source_path,
                asset_type=asset_type,
                sort_order=sort_order,
                insertion_marker=insertion_marker,
                alt_text=alt_text,
            )

    def _add_managed_asset(
        self,
        article_id: Any,
        source_path: str | Path,
        *,
        asset_type: str,
        sort_order: int = 0,
        insertion_marker: str | None = None,
        alt_text: str = "",
    ) -> dict[str, Any]:

        article_value = safe_article_id(article_id)
        role = str(asset_type or "").strip().lower()
        if role not in {"cover", "inline"}:
            raise ValueError("asset_type must be cover or inline")
        marker = str(insertion_marker or "").strip() or None
        if role == "cover" and marker is not None:
            raise ValueError("cover image cannot have an insertion_marker")
        if role == "inline" and marker is None:
            raise ValueError("inline image requires an insertion_marker")

        source = Path(source_path)
        if not source.is_file():
            raise FileNotFoundError(source)
        size = source.stat().st_size
        if size < 1 or size > MAX_IMAGE_BYTES:
            raise ValueError("image must be between 1 byte and 10 MiB")
        mime_type = self._detect_mime(source)
        extension = SUPPORTED_IMAGES[mime_type]
        local_asset_id = str(uuid4())
        managed_name = f"{local_asset_id}{extension}"
        destination = self.article_dir(article_value) / managed_name
        self._require_inside_root(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)

        digest = hashlib.sha256()
        copied_size = 0
        fd, tmp_name = tempfile.mkstemp(
            prefix=managed_name + ".",
            suffix=".tmp",
            dir=str(destination.parent),
        )
        tmp = Path(tmp_name)
        try:
            with source.open("rb") as input_handle, os.fdopen(fd, "wb") as output_handle:
                while True:
                    chunk = input_handle.read(1024 * 1024)
                    if not chunk:
                        break
                    copied_size += len(chunk)
                    if copied_size > MAX_IMAGE_BYTES:
                        raise ValueError("image must be between 1 byte and 10 MiB")
                    digest.update(chunk)
                    output_handle.write(chunk)
                if copied_size < 1:
                    raise ValueError("image must be between 1 byte and 10 MiB")
                output_handle.flush()
                os.fsync(output_handle.fileno())
            os.replace(tmp, destination)
        finally:
            tmp.unlink(missing_ok=True)

        now = _utc_now_iso()
        record = {
            "local_asset_id": local_asset_id,
            "asset_type": role,
            "original_filename": source.name[:255],
            "managed_filename": managed_name,
            "mime_type": mime_type,
            "size_bytes": copied_size,
            "checksum_sha256": digest.hexdigest(),
            "sort_order": int(sort_order),
            "insertion_marker": marker,
            "alt_text": str(alt_text or "")[:2000],
            "cloud_asset_id": None,
            "storage_bucket": None,
            "storage_path": None,
            "cloud_status": "local_only",
            "desired_state": "active",
            "last_sync_error": None,
            "created_at": now,
            "updated_at": now,
        }

        payload = self.load_payload(article_value)
        assets = self._asset_list(payload)
        remove_local: list[dict[str, Any]] = []
        for existing in assets:
            if existing.get("desired_state") == "delete":
                continue
            same_cover = role == "cover" and existing.get("asset_type") == "cover"
            same_inline = (
                role == "inline"
                and existing.get("asset_type") == "inline"
                and str(existing.get("insertion_marker") or "") == marker
            )
            if same_cover or same_inline:
                if existing.get("cloud_asset_id"):
                    self._request_delete(existing)
                else:
                    self._unlink_managed(article_value, existing.get("managed_filename"))
                    remove_local.append(existing)
        for existing in remove_local:
            assets.remove(existing)
        assets.append(record)
        payload[MANAGED_ASSETS_KEY] = assets
        try:
            self.save_payload(article_value, payload)
        except Exception:
            destination.unlink(missing_ok=True)
            raise
        return dict(record)

    def edit_metadata(self, article_id: Any, local_asset_id: str, *, sort_order: int,
                      insertion_marker: str | None, alt_text: str) -> dict[str, Any]:
        """Keep an offline metadata draft and its last observed cloud version."""
        with self._lock:
            payload = self.load_payload(article_id)
            assets = self._asset_list(payload)
            target = self._find(assets, local_asset_id)
            if target.get("desired_state") != "active" or target.get("cloud_status") not in {"ready", "local_only"}:
                raise ValueError("先に画像の転送・削除を完了してください。")
            if target.get("cloud_asset_id") and not target.get("cloud_updated_at"):
                raise ValueError("先に「クラウド同期を再試行」で画像情報を再取得してください。")
            if isinstance(sort_order, bool) or not isinstance(sort_order, int) or not 0 <= sort_order <= 2147483647:
                raise ValueError("表示順は0以上の整数で指定してください。")
            marker = str(insertion_marker or "").strip() or None
            if (target.get("asset_type") == "cover" and marker is not None) or (target.get("asset_type") == "inline" and (not marker or len(marker) > 500)):
                raise ValueError("挿絵の挿入マーカーを1〜500文字で指定してください。")
            if len(alt_text) > 2000:
                raise ValueError("代替テキストは2000文字以内です。")
            if marker and any(a.get("desired_state") == "active" and a.get("local_asset_id") != local_asset_id and a.get("insertion_marker") == marker for a in assets):
                raise ValueError("同じ挿入マーカーの画像があります。")
            target.update(sort_order=sort_order, insertion_marker=marker, alt_text=str(alt_text),
                          metadata_dirty=bool(target.get("cloud_asset_id")),
                          metadata_edit_version=int(target.get("metadata_edit_version") or 0)+1,
                          last_sync_error=None, updated_at=_utc_now_iso())
            payload[MANAGED_ASSETS_KEY] = assets
            self.save_payload(article_id, payload)
            return dict(target)

    def update_managed_asset(
        self,
        article_id: Any,
        local_asset_id: str,
        changes: Mapping[str, Any],
    ) -> dict[str, Any]:
        with self._lock:
            return self._update_managed_asset(article_id, local_asset_id, changes)

    def _update_managed_asset(
        self,
        article_id: Any,
        local_asset_id: str,
        changes: Mapping[str, Any],
    ) -> dict[str, Any]:
        payload = self.load_payload(article_id)
        assets = self._asset_list(payload)
        target = self._find(assets, local_asset_id)
        protected = {"local_asset_id", "managed_filename"}
        for key, value in dict(changes).items():
            if key not in protected and key != "signed_url":
                target[key] = value
        target.pop("signed_url", None)
        target["updated_at"] = _utc_now_iso()
        payload[MANAGED_ASSETS_KEY] = assets
        self.save_payload(article_id, payload)
        return dict(target)

    def mark_delete(self, article_id: Any, local_asset_id: str) -> bool:
        with self._lock:
            return self._mark_delete(article_id, local_asset_id)

    def _mark_delete(self, article_id: Any, local_asset_id: str) -> bool:
        payload = self.load_payload(article_id)
        assets = self._asset_list(payload)
        target = self._find(assets, local_asset_id)
        if target.get("cloud_asset_id"):
            self._request_delete(target)
        else:
            self._unlink_managed(article_id, target.get("managed_filename"))
            assets.remove(target)
        payload[MANAGED_ASSETS_KEY] = assets
        self.save_payload(article_id, payload)
        return True

    def remove_managed_asset(self, article_id: Any, local_asset_id: str) -> bool:
        """Remove local metadata/file only after cloud deletion is confirmed."""

        with self._lock:
            return self._remove_managed_asset(article_id, local_asset_id)

    def _remove_managed_asset(self, article_id: Any, local_asset_id: str) -> bool:

        payload = self.load_payload(article_id)
        assets = self._asset_list(payload)
        target = self._find(assets, local_asset_id)
        self._unlink_managed(article_id, target.get("managed_filename"))
        assets.remove(target)
        payload[MANAGED_ASSETS_KEY] = assets
        self.save_payload(article_id, payload)
        return True

    def managed_file_path(self, article_id: Any, asset: Mapping[str, Any]) -> Path:
        name = Path(str(asset.get("managed_filename") or "")).name
        if not name:
            raise ValueError("managed_filename is required")
        path = self.article_dir(article_id) / name
        self._require_inside_article_dir(article_id, path)
        return path

    def delete_article_files(self, article_id: Any) -> None:
        directory = self.article_dir(article_id)
        self._require_inside_root(directory)
        if directory.parent.is_dir():
            shutil.rmtree(directory.parent)

    @staticmethod
    def _asset_list(payload: Mapping[str, Any]) -> list[dict[str, Any]]:
        values = payload.get(MANAGED_ASSETS_KEY)
        return [dict(item) for item in values if isinstance(item, Mapping)] if isinstance(values, list) else []

    @staticmethod
    def _find(assets: list[dict[str, Any]], local_asset_id: str) -> dict[str, Any]:
        value = str(local_asset_id or "").strip()
        for item in assets:
            if str(item.get("local_asset_id") or "") == value:
                return item
        raise KeyError(value)

    @staticmethod
    def _request_delete(asset: dict[str, Any]) -> None:
        asset["desired_state"] = "delete"
        asset["cloud_status"] = "delete_pending" if asset.get("cloud_asset_id") else "local_only"
        asset["last_sync_error"] = None
        asset["updated_at"] = _utc_now_iso()

    def _unlink_managed(self, article_id: Any, filename: Any) -> None:
        name = Path(str(filename or "")).name
        if not name:
            return
        path = self.article_dir(article_id) / name
        self._require_inside_article_dir(article_id, path)
        path.unlink(missing_ok=True)

    def _require_inside_article_dir(self, article_id: Any, path: Path) -> None:
        root = self.article_dir(article_id).resolve()
        candidate = path.resolve()
        if candidate != root and root not in candidate.parents:
            raise ValueError("managed image path escaped the article directory")

    def _require_inside_root(self, path: Path) -> None:
        root = self.root.resolve()
        candidate = path.resolve()
        if candidate != root and root not in candidate.parents:
            raise ValueError("managed image path escaped the image root")

    @staticmethod
    def _detect_mime(path: Path) -> str:
        with path.open("rb") as handle:
            head = handle.read(16)
            if head.startswith(b"\x89PNG\r\n\x1a\n"):
                return "image/png"
            if head.startswith(b"\xff\xd8\xff"):
                return "image/jpeg"
            if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
                return "image/webp"
        raise ValueError("only PNG, JPEG, and WebP images are supported")
