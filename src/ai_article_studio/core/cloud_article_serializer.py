from __future__ import annotations

from copy import deepcopy
import hashlib
import json
from typing import Any, Mapping


ARTICLE_TOP_LEVEL_KEYS = {
    "article_id",
    "created_at",
    "updated_at",
    "status",
    "title",
    "request",
    "content",
    "image_plan",
}

BODY_CONTENT_KEYS = {
    "blocks",
    "web_original",
    "web_publish",
}


def _object(value: Any) -> dict[str, Any]:
    return deepcopy(dict(value)) if isinstance(value, Mapping) else {}


def _text(value: Any) -> str:
    return str(value or "")


def _current_body(content: Mapping[str, Any]) -> str:
    blocks = content.get("blocks")
    if isinstance(blocks, list):
        for block in blocks:
            if isinstance(block, Mapping) and block.get("markdown") is not None:
                return _text(block.get("markdown"))
    return _text(content.get("web_publish") or content.get("body"))


def _publication_target(value: Any) -> str:
    normalized = _text(value).strip()
    return {
        "note": "note",
        "tips": "tips",
        "brain": "brain",
        "blog": "blog",
        "ブログ": "blog",
    }.get(normalized.lower(), "blog" if normalized == "ブログ" else normalized.lower() or "note")


def _windows_platform(value: Any) -> str:
    return {
        "note": "note",
        "tips": "Tips",
        "brain": "Brain",
        "blog": "ブログ",
    }.get(_text(value).strip().lower(), _text(value).strip() or "note")


def _article_type(value: Any) -> str:
    normalized = _text(value).strip().lower()
    return {"無料": "free", "有料": "paid"}.get(normalized, normalized or "free")


def _windows_article_type(value: Any) -> str:
    return {"free": "無料", "paid": "有料"}.get(
        _text(value).strip().lower(),
        _text(value).strip() or "無料",
    )


def _article_status(value: Any) -> str:
    normalized = _text(value).strip()
    return {
        "完成": "ready",
        "下書き": "draft",
        "作成中": "writing",
        "公開待ち": "waiting_publish",
        "公開済み": "published",
        "保留": "on_hold",
        "アーカイブ": "archived",
    }.get(normalized, normalized.lower() or "draft")


def _windows_status(value: Any) -> str:
    return {
        "ready": "完成",
        "draft": "draft",
        "writing": "writing",
        "waiting_publish": "waiting_publish",
        "published": "published",
        "on_hold": "on_hold",
        "archived": "archived",
    }.get(_text(value).strip().lower(), _text(value).strip() or "draft")


def serialize_article_record(
    record: Mapping[str, Any],
    *,
    image_plan: Mapping[str, Any] | None = None,
) -> dict[str, dict[str, Any]]:
    """Split one Windows ArticleRecord payload into cloud article/workspace data.

    The input is never mutated. Unknown non-body ArticleRecord fields are kept
    under workspace_json.record_metadata so later application versions can
    still reconstruct them.
    """

    payload = _object(record)
    request_json = _object(payload.get("request"))
    content = _object(payload.get("content"))
    current_body = _current_body(content)
    source_body = _text(content.get("web_original"))
    publish_body = _text(content.get("web_publish") or current_body)

    article_type = _article_type(request_json.get("article_type"))
    price = request_json.get("price_jpy")
    if article_type == "free":
        price = None
    elif price in (None, ""):
        price = request_json.get("price")
    if price not in (None, ""):
        price = int(price)
    else:
        price = None

    article = {
        "title": _text(payload.get("title")),
        "publication_target": _publication_target(request_json.get("platform")),
        "article_type": article_type,
        "genre": _text(request_json.get("genre")).strip() or None,
        "subgenre": _text(request_json.get("subgenre")).strip() or None,
        "body": current_body,
        "status": _article_status(payload.get("status")),
        "price": price,
        "tags": deepcopy(request_json.get("tags") or []),
        "scheduled_at": request_json.get("scheduled_at"),
        "published_at": request_json.get("published_at"),
        "published_url": request_json.get("published_url"),
    }

    record_metadata = {
        key: deepcopy(value)
        for key, value in payload.items()
        if key not in ARTICLE_TOP_LEVEL_KEYS
    }
    content_extra = {
        key: deepcopy(value)
        for key, value in content.items()
        if key not in BODY_CONTENT_KEYS
    }
    workspace_json = {
        "record_metadata": record_metadata,
        "content_extra": content_extra,
        "local_status": _text(payload.get("status")),
        "local_created_at": payload.get("created_at"),
        "local_updated_at": payload.get("updated_at"),
    }

    selected_image_plan = image_plan
    if selected_image_plan is None:
        selected_image_plan = payload.get("image_plan")
    workspace = {
        "request_json": request_json,
        "workspace_json": workspace_json,
        "image_plan_json": _object(selected_image_plan),
        "source_body": source_body,
        "publish_body": publish_body,
    }
    return {"article": article, "workspace": workspace}


def deserialize_article_record(
    article: Mapping[str, Any],
    workspace: Mapping[str, Any],
    *,
    local_article_id: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Reconstruct a Windows ArticleRecord-like payload and its image plan."""

    article_data = _object(article)
    workspace_data = _object(workspace)
    workspace_json = _object(workspace_data.get("workspace_json"))
    record = _object(workspace_json.get("record_metadata"))
    request_json = _object(workspace_data.get("request_json"))

    request_json.update(
        {
            "platform": _windows_platform(article_data.get("publication_target")),
            "article_type": _windows_article_type(article_data.get("article_type")),
            "genre": article_data.get("genre") or "",
            "subgenre": article_data.get("subgenre") or "",
            "price_jpy": article_data.get("price"),
            "tags": deepcopy(article_data.get("tags") or []),
            "scheduled_at": article_data.get("scheduled_at"),
            "published_at": article_data.get("published_at"),
            "published_url": article_data.get("published_url"),
        }
    )

    current_body = _text(article_data.get("body"))
    content = _object(workspace_json.get("content_extra"))
    content.update(
        {
            "blocks": [{"markdown": current_body}],
            "web_original": _text(workspace_data.get("source_body")),
            "web_publish": _text(workspace_data.get("publish_body") or current_body),
        }
    )

    record.update(
        {
            "article_id": _text(local_article_id or article_data.get("id")),
            "created_at": workspace_json.get("local_created_at")
            or article_data.get("created_at"),
            "updated_at": workspace_json.get("local_updated_at")
            or article_data.get("updated_at"),
            "status": workspace_json.get("local_status")
            or _windows_status(article_data.get("status")),
            "title": _text(article_data.get("title")),
            "request": request_json,
            "content": content,
        }
    )
    return record, _object(workspace_data.get("image_plan_json"))


def cloud_payload_hash(serialized: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        serialized,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
