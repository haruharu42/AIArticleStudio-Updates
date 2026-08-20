from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping

VALID_TARGETS = {"eyecatch", "illustrations", "both"}
VALID_MODES = {"web", "api", "local"}
VALID_STYLES = {
    "auto",
    "business",
    "tech",
    "gentle",
    "diagram",
    "anime",
    "manga",
    "pop",
    "luxury",
    "catchy_thumbnail",
    "natural_blog",
    "minimal",
    "infographic",
}
VALID_COUNTS = {"auto", "1", "2", "3"}
VALID_TEXT_MODES = {"none", "title", "title_and_catchcopy"}
VALID_SIZE_PRESETS = {"note", "tips", "brain", "blog_landscape", "square"}

STYLE_LABELS = {
    "auto": "おまかせ",
    "business": "ビジネス",
    "tech": "テック",
    "gentle": "やさしい",
    "diagram": "図解風",
    "anime": "アニメ風",
    "manga": "漫画風",
    "pop": "ポップ風",
    "luxury": "高級感",
    "catchy_thumbnail": "サムネ映え重視",
    "natural_blog": "ナチュラル",
    "minimal": "ミニマル",
    "infographic": "インフォグラフィック",
}


@dataclass(frozen=True)
class ImageSettings:
    enabled: bool = False
    target: str = "both"
    mode: str = "web"
    style: str = "auto"
    illustration_count: str = "auto"
    insert_markers: bool = True
    text_mode: str = "none"
    size_preset: str = "note"
    generate_alt_text: bool = True
    generate_caption: bool = False
    include_illustration_summary: bool = True

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _choice(value: Any, allowed: set[str], default: str) -> str:
    text = str(value).strip() if value is not None else ""
    return text if text in allowed else default


def _bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on", "有効", "オン"}:
        return True
    if text in {"0", "false", "no", "off", "無効", "オフ"}:
        return False
    return default


def normalize_image_settings(raw: Mapping[str, Any] | None) -> ImageSettings:
    """Return a safe settings object from new or legacy article data.

    Unknown values never propagate into the workflow. Missing or malformed data
    falls back to the API-free Web mode and keeps the whole image feature off.
    """

    data = dict(raw or {})
    return ImageSettings(
        enabled=_bool(data.get("enabled"), False),
        target=_choice(data.get("target"), VALID_TARGETS, "both"),
        mode=_choice(data.get("mode"), VALID_MODES, "web"),
        style=_choice(data.get("style"), VALID_STYLES, "auto"),
        illustration_count=_choice(
            data.get("illustration_count", data.get("inline_count")),
            VALID_COUNTS,
            "auto",
        ),
        insert_markers=_bool(data.get("insert_markers"), True),
        text_mode=_choice(data.get("text_mode"), VALID_TEXT_MODES, "none"),
        size_preset=_choice(data.get("size_preset"), VALID_SIZE_PRESETS, "note"),
        generate_alt_text=_bool(data.get("generate_alt_text", data.get("show_alt_text")), True),
        generate_caption=_bool(data.get("generate_caption", data.get("show_caption")), False),
        include_illustration_summary=_bool(data.get("include_illustration_summary"), True),
    )


def merge_image_settings(raw: Mapping[str, Any] | None, **changes: Any) -> ImageSettings:
    current = normalize_image_settings(raw).to_dict()
    current.update(changes)
    return normalize_image_settings(current)


def image_feature_active(raw: Mapping[str, Any] | None) -> bool:
    return normalize_image_settings(raw).enabled


def style_label(style: str) -> str:
    return STYLE_LABELS.get(str(style or "auto"), STYLE_LABELS["auto"])
