from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
from typing import Iterable


PUBLISH_PLATFORM_URLS = {
    "note": "https://note.com/",
    "Tips": "https://tips.jp/",
    "Brain": "https://brain-market.com/",
    "ブログ": "",
    "その他": "",
}


@dataclass(frozen=True)
class PublishAction:
    key: str
    label: str
    kind: str
    value: str = ""
    primary: bool = False
    enabled: bool = True


@dataclass
class PublishReadyState:
    platform: str
    article_text: str
    selected_title: str = ""
    can_publish: bool = False
    missing_requirements: list[str] | None = None
    actions: list[PublishAction] | None = None

    def __post_init__(self) -> None:
        if self.missing_requirements is None:
            self.missing_requirements = []
        if self.actions is None:
            self.actions = []


def _safe_platform(value: str) -> str:
    platform = str(value or "note").strip()
    aliases = {
        "tips": "Tips",
        "TIPS": "Tips",
        "brain": "Brain",
        "NOTE": "note",
    }
    platform = aliases.get(platform, platform)
    return platform if platform in PUBLISH_PLATFORM_URLS else "その他"


def _slug(text: str) -> str:
    value = str(text or "article").strip()
    value = re.sub(r"[\\/:*?\"<>|]+", "_", value)
    value = re.sub(r"\s+", "_", value)
    value = value.strip("._ ")
    return value[:80] or "article"


def build_publish_ready_state(
    article_text: str,
    *,
    platform: str = "note",
    selected_title: str = "",
    blocking_issues: Iterable[str] = (),
) -> PublishReadyState:
    text = str(article_text or "").strip()
    target = _safe_platform(platform)
    missing: list[str] = []
    if not text:
        missing.append("article_empty")
    for issue in blocking_issues:
        code = str(issue or "").strip()
        if code and code not in missing:
            missing.append(code)

    can_publish = not missing
    actions: list[PublishAction] = [
        PublishAction("copy_publish", "掲載用をコピー", "copy", value=text, primary=True, enabled=bool(text)),
        PublishAction("preview", "プレビュー", "preview", value=text, enabled=bool(text)),
        PublishAction(
            "save_markdown",
            "Markdown保存",
            "save_markdown",
            value=f"{_slug(selected_title)}.md",
            enabled=bool(text),
        ),
    ]

    ordered_platforms = [target] + [x for x in ("note", "Tips", "Brain") if x != target]
    for item in ordered_platforms:
        url = PUBLISH_PLATFORM_URLS.get(item, "")
        if not url:
            continue
        actions.append(
            PublishAction(
                key=f"open_{item.lower()}",
                label=f"{item}を開く",
                kind="open_url",
                value=url,
                primary=(item == target and can_publish),
                enabled=True,
            )
        )

    return PublishReadyState(
        platform=target,
        article_text=text,
        selected_title=str(selected_title or "").strip(),
        can_publish=can_publish,
        missing_requirements=missing,
        actions=actions,
    )


def primary_publish_action(state: PublishReadyState) -> PublishAction | None:
    # 完了画面では「掲載用をコピー」を最初の主要CTAとする。
    for action in state.actions:
        if action.key == "copy_publish" and action.enabled:
            return action
    return None


def primary_platform_action(state: PublishReadyState) -> PublishAction | None:
    key = f"open_{state.platform.lower()}"
    for action in state.actions:
        if action.key == key:
            return action
    return None


def markdown_filename(state: PublishReadyState) -> str:
    for action in state.actions:
        if action.key == "save_markdown":
            return action.value
    return "article.md"


def save_markdown_text(state: PublishReadyState, destination: str | Path) -> Path:
    if not state.article_text:
        raise ValueError("article_text is empty")
    path = Path(destination)
    if path.suffix.lower() != ".md":
        path = path / markdown_filename(state)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(state.article_text.rstrip() + "\n", encoding="utf-8")
    return path


def completion_steps(state: PublishReadyState) -> list[str]:
    if not state.can_publish:
        return ["記事の不足項目を修正する"]
    platform_label = state.platform if state.platform in {"note", "Tips", "Brain"} else "掲載先"
    return [
        "掲載用をコピーする",
        "必要ならプレビューで最終確認する",
        f"{platform_label}を開く",
        "貼り付けて公開前の最終確認をする",
    ]
