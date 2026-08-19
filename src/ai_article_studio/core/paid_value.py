from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


GENRE_OUTPUT_TYPES: dict[str, list[str]] = {
    "AI・生成AI": ["copy_paste_prompt", "checklist", "template", "roadmap"],
    "AI副業": ["practical_steps", "copy_paste_prompt", "checklist", "template", "roadmap"],
    "副業・在宅ワーク": ["practical_steps", "checklist", "worksheet", "roadmap"],
    "note・コンテンツ販売": ["template", "checklist", "decision_framework", "copy_paste_prompt", "roadmap"],
    "SNS・情報発信": ["template", "checklist", "roadmap", "worksheet"],
    "YouTube・動画制作": ["template", "checklist", "roadmap"],
    "ビジネス・仕事術": ["template", "checklist", "decision_framework", "worksheet"],
    "転職・キャリア": ["worksheet", "checklist", "decision_framework", "roadmap"],
    "学習・資格": ["roadmap", "worksheet", "checklist"],
    "節約・家計管理": ["worksheet", "checklist", "decision_framework"],
    "ガジェット・PC・デジタル": ["comparison", "decision_framework", "checklist"],
}

OUTPUT_LABELS = {
    "practical_steps": "実践手順",
    "template": "テンプレート",
    "checklist": "チェックリスト",
    "worksheet": "ワークシート",
    "comparison": "比較表",
    "case_example": "ケース例",
    "failure_example": "失敗例",
    "decision_framework": "判断フレーム",
    "copy_paste_prompt": "コピペ用プロンプト",
    "roadmap": "ロードマップ",
    "primary_experience": "実体験",
    "original_data": "独自データ",
    "advanced_tips": "応用Tips",
}


def _get(data: Any, key: str, default: Any = None) -> Any:
    if isinstance(data, dict):
        return data.get(key, default)
    return getattr(data, key, default)


def _to_price(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text in {"AIおすすめ", "AIおまかせ", "auto"}:
        return None
    try:
        price = int(text)
    except (TypeError, ValueError):
        return None
    return price if price >= 0 else None


@dataclass(frozen=True)
class ActionableOutput:
    type: str
    title: str
    purpose: str
    content_requirements: tuple[str, ...]
    placement: str = "paid_main"
    reusable: bool = True
    copy_paste_ready: bool = False


@dataclass
class PaidValueProfile:
    enabled: bool
    price_jpy: int | None = None
    price_mode: str = "ai_recommend"
    reader_outcome: str = ""
    free_value: list[str] = field(default_factory=list)
    paid_value: list[str] = field(default_factory=list)
    value_elements: list[str] = field(default_factory=list)
    actionable_outputs: list[ActionableOutput] = field(default_factory=list)
    bonus_enabled: bool = False
    bonus_mode: str = "off"
    bonus_items: list[ActionableOutput] = field(default_factory=list)
    free_paid_difference: str = ""
    boundary_strategy: str = "standard"
    cta_strength: str = "natural"
    price_fit: str = "unknown"
    missing_value_elements: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _make_output(kind: str, genre: str, placement: str = "paid_main") -> ActionableOutput:
    label = OUTPUT_LABELS.get(kind, kind)
    title = f"{genre or '記事テーマ'}向け{label}"
    requirements = {
        "practical_steps": ("開始条件を明示", "手順を順番に提示", "失敗しやすい点を含める"),
        "template": ("そのまま使える記入欄または例を含める", "抽象的な説明だけで終わらせない"),
        "checklist": ("実際のチェック項目を5項目以上生成", "確認基準を具体化する"),
        "worksheet": ("読者が書き込める質問または項目を含める", "実行後の振り返り欄を含める"),
        "comparison": ("比較軸を明示", "未確認の価格・在庫・評価を作らない"),
        "decision_framework": ("判断条件を複数提示", "向いている場合と向かない場合を分ける"),
        "copy_paste_prompt": ("コピペ可能な完成プロンプトを生成", "入力差し替え箇所を明示"),
        "roadmap": ("期間ごとの行動を提示", "成果保証ではなく実行計画として表現"),
    }.get(kind, ("本文だけでなく完成した成果物を生成する",))
    return ActionableOutput(
        type=kind,
        title=title,
        purpose=f"読者が記事を読んだ後に{label}として再利用できる状態にする",
        content_requirements=requirements,
        placement=placement,
        copy_paste_ready=kind in {"template", "copy_paste_prompt", "checklist"},
    )


def _desired_output_count(price_jpy: int | None) -> int:
    if price_jpy is None:
        return 1
    if price_jpy >= 1980:
        return 3
    if price_jpy >= 780:
        return 2
    return 1


def build_paid_value_profile(request: Any, existing_output_types: list[str] | None = None) -> PaidValueProfile:
    article_type = str(_get(request, "article_type", "無料") or "無料")
    if article_type != "有料":
        return PaidValueProfile(enabled=False)

    genre = str(_get(request, "genre", "") or "")
    price_jpy = _to_price(_get(request, "price", _get(request, "paid_price_jpy", None)))
    price_mode = "manual" if price_jpy is not None else "ai_recommend"
    existing = set(existing_output_types or [])

    candidates = GENRE_OUTPUT_TYPES.get(
        genre,
        ["practical_steps", "checklist", "template", "decision_framework"],
    )
    # User-provided experience is allowed to support the article, but never becomes a required output.
    experience_text = str(
        _get(request, "experience_text", _get(request, "personal_experience", "")) or ""
    ).strip()

    count = _desired_output_count(price_jpy)
    selected: list[str] = []
    for kind in candidates:
        if kind in existing or kind in selected:
            continue
        selected.append(kind)
        if len(selected) >= count:
            break

    outputs = [_make_output(kind, genre, "paid_main") for kind in selected]

    bonus_setting = str(_get(request, "bonus_mode", "auto") or "auto")
    bonus_enabled = bool(_get(request, "bonus_enabled", True)) and bonus_setting != "off"
    bonus_items: list[ActionableOutput] = []
    if bonus_enabled:
        for kind in candidates:
            if kind not in selected and kind not in existing:
                bonus_items = [_make_output(kind, genre, "bonus")]
                break

    missing: list[str] = []
    if not outputs:
        missing.append("actionable_output")
    if not selected:
        missing.append("value_element")

    price_fit = "good"
    if price_jpy is not None and price_jpy >= 1980 and len(outputs) < 2:
        price_fit = "thin"
        missing.append("additional_reusable_output")
    elif price_jpy is not None and price_jpy <= 300 and len(outputs) >= 3:
        price_fit = "overbuilt"

    warnings: list[str] = []
    if not experience_text:
        warnings.append("実体験の入力がないため、一人称の体験・実績を創作しない。")
    if genre == "ガジェット・PC・デジタル":
        warnings.append("商品価格・在庫・評価・レビュー数は未確認のまま生成しない。")
    if genre == "AI副業":
        warnings.append("月収・売上・成功率などの成果を保証しない。")

    return PaidValueProfile(
        enabled=True,
        price_jpy=price_jpy,
        price_mode=price_mode,
        reader_outcome="無料部分で理解し、有料部分で実行・判断・再利用できる状態にする。",
        free_value=["課題の整理", "基本方針", "読者が一つ以上持ち帰れる具体策"],
        paid_value=["実践手順", "判断基準", "再利用できる成果物"],
        value_elements=selected,
        actionable_outputs=outputs,
        bonus_enabled=bonus_enabled,
        bonus_mode=bonus_setting,
        bonus_items=bonus_items,
        free_paid_difference="無料部分は理解と方向付け、有料部分は実行・判断・再利用できる完成成果物を提供する。",
        boundary_strategy=str(_get(request, "paid_boundary_mode", "standard") or "standard"),
        cta_strength=str(_get(request, "cta_strength", "natural") or "natural"),
        price_fit=price_fit,
        missing_value_elements=list(dict.fromkeys(missing)),
        warnings=warnings,
    )


def paid_value_prompt_lines(profile: PaidValueProfile) -> list[str]:
    if not profile.enabled:
        return []
    lines = [
        "【有料部分の価値要件】",
        "- 無料部分だけでも役立つ情報を含める。",
        "- 有料部分は無料部分の言い換え・水増しにしない。",
        "- 有料部分では、読者が実際に使える成果物を完成形で出力する。",
    ]
    if profile.price_jpy is not None:
        lines.append(f"- 設定価格: {profile.price_jpy}円。価格を理由に文字数だけを増やさない。")
    for item in profile.actionable_outputs:
        lines.append(f"- 成果物: {item.title}。" + " / ".join(item.content_requirements))
    for item in profile.bonus_items:
        lines.append(f"- 特典: {item.title}。名前だけでなく中身まで生成する。")
    for warning in profile.warnings:
        lines.append(f"- 注意: {warning}")
    if profile.price_fit == "thin":
        lines.append("- 現状は価格に対して価値が薄い可能性があるため、実用成果物を補強する。")
    return lines
