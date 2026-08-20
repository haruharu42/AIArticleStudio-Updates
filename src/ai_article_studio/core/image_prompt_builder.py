from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Mapping, Sequence

from .image_marker_parser import IllustrationMarker, extract_markers
from .image_settings import ImageSettings, normalize_image_settings


STYLE_HINTS = {
    "auto": "記事テーマに合う自然で見やすいデザイン",
    "business": "清潔感のあるビジネス向け、整理された構図、信頼感",
    "tech": "モダンなテック系、未来感、情報が整理された構図",
    "gentle": "やさしい商用イラスト風。柔らかな色、親しみやすい人物、穏やかな陰影で読みやすくする",
    "diagram": "図解風、要素の関係が一目で分かる構図",
    "anime": "日本の現代的な2Dアニメ調。クリーンで明瞭な線画、セル塗り寄りの2〜3段階の陰影、整理された髪の束感、印象的だが自然な目元、アニメ背景美術らしい空気感を使う。既存作品や特定作家の画風は模倣しない",
    "manga": "オリジナルの現代的な漫画調。はっきりした線画、メリハリのある陰影、漫画的な表情と視線誘導、必要に応じてコマ・集中線・吹き出し風の演出を使う。既存作品・漫画家・キャラクターの模倣は避ける",
    "pop": "明るくポップ、軽快で親しみやすい、視認性の高い構図",
    "luxury": "余白を活かした上品で洗練された高級感、落ち着いた質感",
    "catchy_thumbnail": "縮小表示でも主題が一目で分かる、強い視認性と明快な焦点、過剰な煽りは避ける",
    "natural_blog": "自然光を感じる柔らかなブログ向け、生活になじむ自然体の雰囲気",
    "minimal": "要素を絞ったミニマルデザイン、広い余白、主題が明確",
    "infographic": "インフォグラフィック風、情報の階層と関係性が分かりやすい整理された構図",
}

STYLE_RULES = {
    "anime": (
        "画風の優先ルール: 人物・背景・小物・UIモチーフまで一貫して2Dアニメ表現にする。",
        "線画とセル塗りが視覚的に分かる仕上げにし、柔らかい光やグラデーションだけでアニメ感を表現しない。",
        "人物は成人向け記事に合う自然な頭身と落ち着いた表情にし、必要がない限りデフォルメやちびキャラにはしない。",
        "避ける方向: 写真、フォトリアル、半写実、3Dレンダー、水彩、絵本、フラットな企業広告イラスト、ベクター素材風。",
    ),
    "manga": (
        "画風の優先ルール: 線画の存在感を強くし、人物・背景・説明要素を同じ漫画的タッチで統一する。",
        "必要に応じてコマ割り、集中線、効果線、漫画的な視線誘導を使うが、情報を詰め込みすぎない。",
        "カラーの場合も線画を埋もれさせず、セル塗りまたは限定色で漫画らしいメリハリを保つ。",
        "避ける方向: 写真、フォトリアル、半写実、3Dレンダー、水彩、企業向け抽象イラスト、一般的なストック素材風。",
    ),
    "gentle": (
        "このプリセットはアニメ風とは分け、やさしい商用イラストとして自然で柔らかな表現を優先する。",
    ),
}

SIZE_HINTS = {
    "note": "note向けの横長アイキャッチを想定",
    "tips": "Tips向けの横長アイキャッチを想定",
    "brain": "Brain向けの横長アイキャッチを想定",
    "blog_landscape": "ブログ向けの横長画像を想定",
    "square": "正方形画像を想定",
}

HEADING_RE = re.compile(r"^(#{1,4})\s+(.+?)\s*$")


@dataclass(frozen=True)
class ImagePromptBundle:
    eyecatch_prompt: str = ""
    illustration_prompts: tuple[dict[str, Any], ...] = ()
    illustration_summary: str = ""
    article_linked: bool = False
    marker_source: str = "none"
    context_excerpt: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "eyecatch_prompt": self.eyecatch_prompt,
            "illustration_prompts": [dict(x) for x in self.illustration_prompts],
            "illustration_summary": self.illustration_summary,
            "article_linked": self.article_linked,
            "marker_source": self.marker_source,
            "context_excerpt": self.context_excerpt,
        }


def _get(data: Any, key: str, default: Any = "") -> Any:
    if isinstance(data, Mapping):
        return data.get(key, default)
    return getattr(data, key, default)


def _clean(text: Any, limit: int = 500) -> str:
    value = " ".join(str(text or "").split())
    return value[:limit]


def _style_lines(cfg: ImageSettings) -> list[str]:
    style = STYLE_HINTS.get(cfg.style, STYLE_HINTS["auto"])
    lines = [f"デザイン: {style}"]
    lines.extend(STYLE_RULES.get(cfg.style, ()))
    return lines


def _article_context(request: Any, title: str) -> list[str]:
    return [
        f"記事タイトル: {_clean(title, 180)}",
        f"掲載先: {_clean(_get(request, 'platform', 'note'), 50)}",
        f"記事タイプ: {_clean(_get(request, 'article_type', '指定なし'), 50)}",
        f"ジャンル: {_clean(_get(request, 'genre', 'AIおまかせ'), 80)}",
        f"サブジャンル: {_clean(_get(request, 'subgenre', 'AIおまかせ'), 80)}",
        f"対象読者: {_clean(_get(request, 'reader_level', '初心者'), 80)} / {_clean(_get(request, 'target_age', '指定なし'), 50)}",
        f"読者の悩み: {_clean(_get(request, 'reader_problem', '記事テーマから推定'), 180)}",
    ]


def _extract_headings(article_text: str, limit: int = 8) -> list[str]:
    headings: list[str] = []
    for line in str(article_text or "").splitlines():
        match = HEADING_RE.match(line.strip())
        if not match:
            continue
        title = _clean(match.group(2), 120)
        if title and title not in headings:
            headings.append(title)
        if len(headings) >= limit:
            break
    return headings


def _article_digest(article_text: str, limit: int = 1100) -> str:
    text = str(article_text or "").strip()
    if not text:
        return ""
    headings = _extract_headings(text)
    paragraphs: list[str] = []
    for block in re.split(r"\n\s*\n", text):
        block = block.strip()
        if not block or block.startswith("[挿絵") or HEADING_RE.match(block):
            continue
        cleaned = _clean(block, 280)
        if cleaned:
            paragraphs.append(cleaned)
        if len(paragraphs) >= 3:
            break
    parts: list[str] = []
    if headings:
        parts.append("主要見出し: " + " / ".join(headings[:6]))
    if paragraphs:
        parts.append("本文要点: " + " ".join(paragraphs))
    return _clean("\n".join(parts), limit)


def _requested_illustration_count(cfg: ImageSettings) -> int:
    if cfg.illustration_count in {"1", "2", "3"}:
        return int(cfg.illustration_count)
    return 3


def _derived_markers(article_text: str, cfg: ImageSettings) -> list[IllustrationMarker]:
    """Create safe illustration positions from an already-created Web article."""

    text = str(article_text or "")
    if not text.strip():
        return []
    count = _requested_illustration_count(cfg)
    markers: list[IllustrationMarker] = []
    for line in text.splitlines():
        stripped = line.strip()
        match = HEADING_RE.match(stripped)
        if not match:
            continue
        heading = _clean(match.group(2), 100)
        if not heading:
            continue
        if len(match.group(1)) == 1:
            continue
        number = len(markers) + 1
        markers.append(
            IllustrationMarker(
                number=number,
                position=f"「{heading}」の後",
                description=f"「{heading}」の内容を理解しやすくする記事連動イメージ",
                raw=stripped,
            )
        )
        if len(markers) >= count:
            break
    if markers:
        return markers

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("[挿絵"):
            continue
        return [
            IllustrationMarker(
                number=1,
                position="導入の後",
                description="記事の主題と要点を直感的に理解しやすくする記事連動イメージ",
                raw=stripped,
            )
        ]
    return []


def build_eyecatch_prompt(
    request: Any,
    title: str,
    settings: Mapping[str, Any] | ImageSettings | None = None,
    article_text: str = "",
) -> str:
    cfg = settings if isinstance(settings, ImageSettings) else normalize_image_settings(settings)
    text_policy = {
        "none": "画像内に文字を入れない。タイトル文字はアプリ側で後から重ねられる余白を確保する。",
        "title": "タイトルを入れる前提の余白を確保する。ただし画像生成モデル側では文字を無理に描画しない。",
        "title_and_catchcopy": "タイトルと短いキャッチコピーを後から重ねられる安全な余白を確保する。画像生成モデル側では文字を無理に描画しない。",
    }[cfg.text_mode]
    digest = _article_digest(article_text)
    lines = [
        "次の記事用アイキャッチ画像を1枚作成してください。",
        *_article_context(request, title),
        *_style_lines(cfg),
        f"サイズ方針: {SIZE_HINTS.get(cfg.size_preset, SIZE_HINTS['note'])}",
        f"文字方針: {text_policy}",
        "タイトルだけでなく、実際の記事本文の主題・見出し・要点と一致するビジュアルにする。",
        "記事内容を誤解させる誇張表現、実在しない実績・売上・レビュー・ランキングの視覚化は避ける。",
        "特定企業や人物のロゴ・顔・著作物を必要なく模倣しない。",
        "サムネイルとして縮小表示しても主題が分かる、余白のあるシンプルな構図にする。",
    ]
    if digest:
        lines.extend(["実際の記事内容（画像の主題決定に優先して参照）:", digest])
    return "\n".join(lines).strip() + "\n"


def _context_excerpt(article_text: str, marker: IllustrationMarker, radius: int = 450) -> str:
    needle = marker.raw
    if not needle:
        return ""
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
    excerpt = _context_excerpt(article_text, marker)
    lines = [
        "次の記事に差し込む挿絵を1枚作成してください。",
        *_article_context(request, title),
        f"挿絵番号: {marker.number}",
        f"推奨位置: {marker.position}",
        f"画像の役割: {marker.description}",
        *_style_lines(cfg),
        "実際の記事本文と意味的に一致させ、本文に存在しない製品・人物・数値・成果を勝手に追加しない。",
        "記事本文の理解を助けることを最優先にし、装飾だけの画像にはしない。",
        "画像内に長い文章や細かい日本語テキストを描画しない。必要なラベルは最小限にする。",
        "実在しない成果、金額、ランキング、口コミ、証拠画像のように見える表現を作らない。",
    ]
    if excerpt:
        lines.extend(["参考にする前後の本文（この内容を優先）:", excerpt])
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
    text = str(article_text or "")
    target_eyecatch = cfg.target in {"eyecatch", "both"}
    target_inline = cfg.target in {"illustrations", "both"}
    eyecatch = build_eyecatch_prompt(request, title, cfg, text) if target_eyecatch else ""
    explicit_markers: Sequence[IllustrationMarker] = extract_markers(text) if target_inline else ()
    marker_source = "explicit" if explicit_markers else "none"
    markers: Sequence[IllustrationMarker] = explicit_markers
    if target_inline and not markers and text.strip():
        markers = _derived_markers(text, cfg)
        if markers:
            marker_source = "derived_from_article"

    limit = _requested_illustration_count(cfg)
    if cfg.illustration_count in {"1", "2", "3"}:
        markers = list(markers)[:limit]

    prompts: list[dict[str, Any]] = []
    for marker in markers:
        prompts.append({
            "label": f"挿絵{marker.number}",
            "number": marker.number,
            "position": marker.position,
            "description": marker.description,
            "marker": marker.raw if marker_source == "explicit" else "",
            "source": marker_source,
            "prompt": build_illustration_prompt(request, title, marker, text, cfg),
        })
    summary = ""
    if cfg.include_illustration_summary and prompts:
        prefix = "【挿絵一覧】" if marker_source == "explicit" else "【記事から提案した挿絵一覧】"
        lines = [prefix] + [f"{p['number']}. {p['position']}：{p['description']}" for p in prompts]
        summary = "\n".join(lines)
    digest = _article_digest(text, 700)
    return ImagePromptBundle(
        eyecatch_prompt=eyecatch,
        illustration_prompts=tuple(prompts),
        illustration_summary=summary,
        article_linked=bool(text.strip()),
        marker_source=marker_source,
        context_excerpt=digest,
    )
