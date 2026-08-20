from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any, Mapping, Sequence

from .image_marker_parser import IllustrationMarker, parse_illustration_markers
from .image_settings import ImageSettings, normalize_image_settings


STYLE_HINTS = {
    "auto": "記事テーマに合う自然で見やすいデザイン",
    "business": "清潔感のあるビジネス向け、整理された構図、信頼感",
    "tech": "モダンなテック系、未来感、情報が整理された構図",
    "gentle": "やさしく親しみやすい雰囲気、落ち着いた構図",
    "diagram": "図解風、要素の関係が一目で分かる構図",
}

SIZE_HINTS = {
    "note": "note向けの横長アイキャッチを想定",
    "tips": "Tips向けの横長アイキャッチを想定",
    "brain": "Brain向けの横長アイキャッチを想定",
    "blog_landscape": "ブログ向けの横長画像を想定",
    "square": "正方形画像を想定",
}


@dataclass(frozen=True)
class ImagePromptBundle:
    eyecatch_prompt: str = ""
    illustration_prompts: tuple[dict[str, Any], ...] = ()
    illustration_summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "eyecatch_prompt": self.eyecatch_prompt,
            "illustration_prompts": [dict(x) for x in self.illustration_prompts],
            "illustration_summary": self.illustration_summary,
        }


def _get(data: Any, key: str, default: Any = "") -> Any:
    if isinstance(data, Mapping):
        return data.get(key, default)
    return getattr(data, key, default)


def _clean(text: Any, limit: int = 500) -> str:
    value = " ".join(str(text or "").split())
    return value[:limit]


def _article_context(request: Any, title: str) -> list[str]:
    return [
        f"記事タイトル: {_clean(title, 180)}",
        f"掲載先: {_clean(_get(request, 'platform', 'note'), 50)}",
        f"ジャンル: {_clean(_get(request, 'genre', 'AIおまかせ'), 80)}",
        f"サブジャンル: {_clean(_get(request, 'subgenre', 'AIおまかせ'), 80)}",
        f"対象読者: {_clean(_get(request, 'reader_level', '初心者'), 80)} / {_clean(_get(request, 'target_age', '指定なし'), 50)}",
        f"読者の悩み: {_clean(_get(request, 'reader_problem', '記事テーマから推定'), 180)}",
    ]


def build_eyecatch_prompt(request: Any, title: str, settings: Mapping[str, Any] | ImageSettings | None = None) -> str:
    cfg = settings if isinstance(settings, ImageSettings) else normalize_image_settings(settings)
    style = STYLE_HINTS.get(cfg.style, STYLE_HINTS["auto"])
    text_policy = {
        "none": "画像内に文字を入れない。タイトル文字はアプリ側で後から重ねられる余白を確保する。",
        "title": "タイトルを入れる前提の余白を確保する。ただし画像生成モデル側では文字を無理に描画しない。",
        "title_and_catchcopy": "タイトルと短いキャッチコピーを後から重ねられる安全な余白を確保する。画像生成モデル側では文字を無理に描画しない。",
    }[cfg.text_mode]
    lines = [
        "次の記事用アイキャッチ画像を1枚作成してください。",
        *_article_context(request, title),
        f"デザイン: {style}",
        f"サイズ方針: {SIZE_HINTS.get(cfg.size_preset, SIZE_HINTS['note'])}",
        f"文字方針: {text_policy}",
        "記事内容を誤解させる誇張表現、実在しない実績・売上・レビュー・ランキングの視覚化は避ける。",
        "特定企業や人物のロゴ・顔・著作物を必要なく模倣しない。",
        "サムネイルとして縮小表示しても主題が分かる、余白のあるシンプルな構図にする。",
    ]
    return "\n".join(lines).strip() + "\n"


def _context_excerpt(article_text: str, marker: IllustrationMarker, radius: int = 450) -> str:
    needle = marker.raw
    pos = article_text.find(needle)
    if pos < 0:
        return ""
    start = max(0, pos - radius)
    end = min(len(article_text), pos + len(needle) + radius)
    excerpt = article_text[start:end].replace(needle, " ")
    return _clean(excerpt, 850)


def build_illustration_prompt(
    request: Any,
    title: str,
    marker: IllustrationMarker,
    article_text: str,
    settings: Mapping[str, Any] | ImageSettings | None = None,
) -> str:
    cfg = settings if isinstance(settings, ImageSettings) else normalize_image_settings(settings)
    style = STYLE_HINTS.get(cfg.style, STYLE_HINTS["auto"])
    excerpt = _context_excerpt(article_text, marker)
    lines = [
        "次の記事に差し込む挿絵を1枚作成してください。",
        *_article_context(request, title),
        f"挿絵番号: {marker.number}",
        f"推奨位置: {marker.position}",
        f"画像の役割: {marker.description}",
        f"デザイン: {style}",
        "記事本文の理解を助けることを最優先にし、装飾だけの画像にはしない。",
        "画像内に長い文章や細かい日本語テキストを描画しない。必要なラベルは最小限にする。",
        "実在しない成果、金額、ランキング、口コミ、証拠画像のように見える表現を作らない。",
    ]
    if excerpt:
        lines.extend(["参考にする前後の本文:", excerpt])
    return "\n".join(lines).strip() + "\n"


def build_image_prompt_bundle(
    request: Any,
    title: str,
    article_text: str,
    settings: Mapping[str, Any] | ImageSettings | None = None,
) -> ImagePromptBundle:
    cfg = settings if isinstance(settings, ImageSettings) else normalize_image_settings(settings)
    if not cfg.enabled:
        return ImagePromptBundle()

    target_eyecatch = cfg.target in {"eyecatch", "both"}
    target_inline = cfg.target in {"illustrations", "both"}
    eyecatch = build_eyecatch_prompt(request, title, cfg) if target_eyecatch else ""

    markers: Sequence[IllustrationMarker] = parse_illustration_markers(article_text) if target_inline else ()
    prompts: list[dict[str, Any]] = []
    for marker in markers:
        prompts.append(
            {
                "label": f"挿絵{marker.number}",
                "number": marker.number,
                "position": marker.position,
                "description": marker.description,
                "marker": marker.raw,
                "prompt": build_illustration_prompt(request, title, marker, article_text, cfg),
            }
        )

    summary = ""
    if cfg.include_illustration_summary and prompts:
        lines = ["【挿絵一覧】"]
        lines += [f"{p['number']}. {p['position']}：{p['description']}" for p in prompts]
        summary = "\n".join(lines)

    return ImagePromptBundle(
        eyecatch_prompt=eyecatch,
        illustration_prompts=tuple(prompts),
        illustration_summary=summary,
    )
