from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .platform_content_strategy import get_platform_strategy, platform_prompt_lines
from .web_ai_prompt_builder import WebAIContext


ABSOLUTE_RULES = (
    "ユーザーが入力していない実体験・実績・レビュー・購入経験・使用経験を事実として作らない。",
    "価格、在庫、評価、キャンペーン、統計、販売数、ランキング、最新仕様など変動する情報を未確認のまま断定しない。",
    "競合記事の文章をコピー・近似模倣しない。",
    "根拠のない成果保証、過度な煽り、架空の権威づけをしない。",
)

QUALITY_RULES = {
    "速さ優先": ("構成を単純にし、重複を避けて必要十分な内容にする。",),
    "標準": ("具体性・読みやすさ・実行可能性のバランスを取る。",),
    "高品質": (
        "主張の一貫性、具体性、反対条件、実行可能性を出力前に確認する。",
        "不要な繰り返しを削り、完成版だけを出力する。",
    ),
}

PROVIDER_STYLE = {
    "ChatGPT": "Markdownの見出しで明確に構造化し、余計な前置きやメタ説明を付けない。",
    "Claude": "長い条件でも要件を混同しないよう、セクション境界を明確にして守る。",
    "Gemini": "重要制約を優先し、見出し構造と出力形式を厳守する。",
    "その他": "以下の条件と出力形式を最優先する。",
}


@dataclass(frozen=True)
class IllustrationOptions:
    enabled: bool = False
    count: str = "自動"
    style: str = "AIおまかせ"
    include_list: bool = True


def _get(data: Any, key: str, default: Any = "") -> Any:
    if isinstance(data, dict):
        return data.get(key, default)
    return getattr(data, key, default)


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "on", "あり", "有", "使う"}


def illustration_options(request: Any) -> IllustrationOptions:
    enabled = any(
        _truthy(_get(request, key, False))
        for key in ("illustration_enabled", "illustrations_enabled", "insert_illustrations", "has_illustrations")
    )
    count = str(_get(request, "illustration_count", "自動") or "自動")
    style = str(_get(request, "illustration_style", "AIおまかせ") or "AIおまかせ")
    include_list = not _truthy(_get(request, "hide_illustration_list", False))
    return IllustrationOptions(enabled=enabled, count=count, style=style, include_list=include_list)


def _platform(request: Any) -> str:
    return str(_get(request, "platform", "note") or "note")


def _article_type(request: Any) -> str:
    return str(_get(request, "article_type", "無料") or "無料")


def _brief_lines(request: Any, selected_title: str = "") -> list[str]:
    fields = [
        ("掲載先", _platform(request)),
        ("記事タイプ", _article_type(request)),
        ("ジャンル", _get(request, "genre", "AIおまかせ")),
        ("サブジャンル", _get(request, "subgenre", "AIおまかせ")),
        ("対象年代", _get(request, "target_age", "AIおまかせ")),
        ("対象性別", _get(request, "target_gender", "指定なし")),
        ("読者レベル", _get(request, "reader_level", "初心者〜中級者を自然に想定")),
        ("読者の悩み", _get(request, "reader_problem", "記事テーマから推定")),
        ("読了後の状態", _get(request, "reader_outcome", "記事テーマから推定")),
        ("文字量", _get(request, "length_mode", "AIおまかせ")),
        ("文体", _get(request, "writing_style", _get(request, "style", "AIおまかせ"))),
        ("切り口", _get(request, "angle", "AIおまかせ")),
    ]
    if selected_title:
        fields.insert(0, ("選択タイトル", selected_title))
    lines = ["【ARTICLE BRIEF】"]
    for label, value in fields:
        if str(value or "").strip():
            lines.append(f"- {label}: {value}")
    exp = ""
    for key in ("experience_text", "personal_experience", "user_experience_text"):
        exp = str(_get(request, key, "") or "").strip()
        if exp:
            break
    if exp:
        lines += ["- ユーザー提供の実体験:", f"  {exp}", "- 一人称の実体験として使えるのは上記だけ。"]
    else:
        lines.append("- ユーザー提供の実体験: なし。体験談を事実として作らない。")
    return lines


def _illustration_lines(request: Any) -> list[str]:
    opt = illustration_options(request)
    if not opt.enabled:
        return []
    lines = [
        "【挿絵モジュール】",
        f"- 挿絵枚数: {opt.count}",
        f"- 挿絵スタイル: {opt.style}",
        "- 本文を最後まで書いた後に記事全体を読み直し、理解を助ける位置だけを選ぶ。均等配置や見出しごとの機械的な配置はしない。",
        "- 挿絵は本文の流れを壊さず、重要な比較・手順・選択肢・全体像など、画像にする意味が高い位置を優先する。",
        "- 本文中のマーカー形式は必ず [挿絵1｜導入の後｜記事全体を理解するためのイメージ] のようにする。",
        "- マーカーには『番号｜差し込み位置｜画像の役割』だけを書き、画像生成用の長いプロンプトは本文に書かない。",
        "- 指定枚数が『自動』なら、記事の長さ・見出し数・内容の複雑さから必要最小限を1〜6枚で判断する。短い記事に無理に増やさない。",
        "- H1直後、有料境界の直前直後、まとめ・CTAの途中には置かず、前後の本文から差し込み位置が一意に分かるようにする。",
    ]
    if opt.include_list:
        lines.append("- 記事末尾に『【挿絵一覧】』を付け、番号・推奨位置・役割を1行ずつ整理する。")
    return lines


def _paid_lines(request: Any) -> list[str]:
    if _article_type(request) != "有料":
        return ["【無料記事ルール】", "- 全文を無料で完結させ、有料境界は入れない。"]
    return [
        "【有料記事ルール】",
        "- 無料部分だけでも一つ以上の具体的価値を提供する。",
        "- 有料境界の直前に、誰向けか・この先で何が得られるか・主な内容を具体的に示す。",
        "- 有料部分は無料部分の言い換えではなく、手順・具体例・テンプレート・判断基準・チェックリスト等で実行可能性を深める。",
        "- 価格に見合う価値は文章量ではなく、時間短縮・再利用性・迷いの削減で作る。",
    ]


def _quality_gate(request: Any, context: WebAIContext) -> list[str]:
    lines = ["【出力前チェック】"]
    lines += [f"- {x}" for x in QUALITY_RULES.get(context.quality, QUALITY_RULES["標準"])]
    lines += [
        "- タイトルと本文の約束が一致しているか。",
        "- 同じ主張を言い換えて水増ししていないか。",
        "- 読者が次に何をすればよいか分かるか。",
        "- 未確認の数字・レビュー・ランキング・実績を事実のように書いていないか。",
    ]
    if illustration_options(request).enabled:
        lines.append("- 挿絵マーカーが本文理解を助ける位置にあり、過剰ではないか。")
    if _article_type(request) == "有料":
        lines.append("- 無料部分と有料部分に明確な価値差があり、有料部分が本文の焼き直しになっていないか。")
    lines.append("- チェック過程は出力せず、完成版だけを返す。")
    return lines


def build_title_prompt_v2(request: Any, context: WebAIContext) -> str:
    strategy = get_platform_strategy(_platform(request))
    lines = [
        "あなたは日本語の編集者兼記事ライターです。",
        "目的は、指定された掲載先で読者が内容を一目で理解できるタイトル候補を作ることです。",
        "",
        "【絶対ルール】",
    ]
    lines += [f"- {x}" for x in ABSOLUTE_RULES]
    lines += ["", *_brief_lines(request)]
    lines += ["", f"【{strategy.key}向けタイトル方針】"]
    lines += [f"- {x}" for x in strategy.title_guidance]
    lines += [
        "",
        "【タスク】",
        "- タイトル候補を5件だけ作る。",
        "- 5件は切り口を少しずつ変える。",
        "- 誇張せず、対象読者・テーマ・得られる価値が伝わるようにする。",
        "",
        "【出力形式】",
        "1. タイトル",
        "2. タイトル",
        "3. タイトル",
        "4. タイトル",
        "5. タイトル",
        "上記以外は出力しない。",
    ]
    return "\n".join(lines).strip() + "\n"


def build_final_article_prompt_v2(request: Any, selected_title: str, context: WebAIContext) -> str:
    provider_rule = PROVIDER_STYLE.get(context.provider, PROVIDER_STYLE["その他"])
    lines = [
        "あなたは日本語の編集者兼記事ライターです。",
        "目的は、指定された掲載先へそのまま掲載できる、具体的で読みやすく、読者が行動できる完成記事を作ることです。",
        "",
        "【絶対ルール】",
    ]
    lines += [f"- {x}" for x in ABSOLUTE_RULES]
    lines += ["", f"【Web AI最適化】{context.provider}", f"- {provider_rule}"]
    if context.model_label:
        lines.append(f"- ユーザーが選ぶ予定のモデル/モード: {context.model_label}")
    lines += ["", *_brief_lines(request, selected_title)]
    lines += ["", *platform_prompt_lines(_platform(request), _article_type(request))]
    lines += ["", *_paid_lines(request)]
    illustration = _illustration_lines(request)
    if illustration:
        lines += ["", *illustration]
    lines += [
        "",
        "【執筆タスク】",
        "- まず内部で記事設計を行い、その設計に沿って本文を書く。設計メモは出力しない。",
        "- 導入で読者の状況を具体化し、この記事で分かることを早めに示す。",
        "- 抽象論だけで終わらせず、必要に応じて手順・例・判断基準・注意点を入れる。",
        "- 文章は人間が自然に読める流れを優先し、箇条書きや表は必要な箇所だけで使う。",
        "- 記事末尾に短いまとめと、読者が次に取れる自然な行動案内を付ける。",
        "",
        "【出力形式】",
        "- 選択タイトルをH1として開始する。",
        "- 一般的なMarkdownで出力する。",
        "- 前置き、作業説明、自己評価、プロンプト解説は出力しない。",
        "- 完成記事だけを返す。",
        "",
        *_quality_gate(request, context),
    ]
    return "\n".join(lines).strip() + "\n"
