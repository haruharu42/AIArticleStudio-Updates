from __future__ import annotations

from dataclasses import dataclass
from typing import Any

COMMON_RULES = [
    "事実・観察・意見・推測・例を混同しない。",
    "ユーザーが入力していない実体験・実績・レビュー・購入経験・使用経験を捏造しない。",
    "価格、在庫、評価、キャンペーン、統計、最新仕様など変動する情報を断定しない。確認できない場合は確認が必要と明記する。",
    "競合記事のコピー、言い換えによる模倣、過度な煽り、根拠のない成果保証をしない。",
    "内容を水増しせず、読者が次に行動できる具体性を優先する。",
    "説明メモではなく、指定された出力形式だけを返す。",
]

PROVIDER_RULES = {
    "ChatGPT": [
        "最初から最後まで自己完結した指示として扱う。",
        "出力形式を厳守し、余計な前置きやメタ説明を付けない。",
    ],
    "Claude": [
        "記事条件、守るルール、出力形式を別の要件として整理して守る。",
        "長文化しても同じ主張を言い換えて繰り返さない。",
    ],
    "Gemini": [
        "見出し構造と出力形式を優先し、未確認の最新情報を補完しない。",
        "表や箇条書きは必要な場所だけで使う。",
    ],
    "その他": [
        "以下の条件を最優先し、出力形式を崩さない。",
    ],
}

PLATFORM_RULES = {
    "note": [
        "読みやすい導入と自然な文章の流れを重視する。",
        "無料部分だけでも読者が一つ以上持ち帰れる内容にする。",
        "有料記事では有料境界の直前で、有料部分で何が得られるかを具体的に示す。",
        "装飾はシンプルにし、一般的なMarkdown表現で崩れにくくする。",
    ],
    "Tips": [
        "実践手順、再現性、購入後に使える成果物を重視する。",
        "有料部分は抽象論よりテンプレート・チェックリスト・具体例を優先する。",
    ],
    "Brain": [
        "ノウハウ密度、実践手順、判断基準、購入後の行動を明確にする。",
        "有料価値は本文量ではなく、実務で使える成果物で補強する。",
    ],
    "ブログ": [
        "検索意図に答える見出し構造と読みやすさを重視する。",
        "導入で結論を引き延ばさず、記事で分かることを明確にする。",
    ],
    "その他": [
        "汎用的で移植しやすいMarkdown構造にする。",
    ],
}

GENRE_VALUE_PROFILES: dict[str, dict[str, list[str]]] = {
    "AI・生成AI": {
        "focus": ["具体的な使い方", "失敗しやすい点", "用途別の判断"],
        "outputs": ["チェックリスト", "コピペ用プロンプト", "用途別テンプレート"],
    },
    "AI副業": {
        "focus": ["作業手順", "必要な準備", "失敗回避", "継続方法"],
        "outputs": ["作業チェックリスト", "コピペ用プロンプト", "実践テンプレート", "ロードマップ"],
    },
    "副業・在宅ワーク": {
        "focus": ["始め方", "作業フロー", "時間管理", "失敗回避"],
        "outputs": ["開始チェックリスト", "週間計画", "判断シート"],
    },
    "note・コンテンツ販売": {
        "focus": ["読者設定", "無料と有料の差", "販売導線", "継続発信"],
        "outputs": ["記事構成テンプレート", "販売前チェックリスト", "シリーズ設計表"],
    },
    "SNS・情報発信": {
        "focus": ["発信軸", "投稿設計", "継続", "反応の振り返り"],
        "outputs": ["投稿テンプレート", "30日投稿案", "振り返りシート"],
    },
    "YouTube・動画制作": {
        "focus": ["企画", "構成", "制作フロー", "改善"],
        "outputs": ["台本テンプレート", "公開前チェックリスト", "企画シート"],
    },
    "ビジネス・仕事術": {
        "focus": ["問題の整理", "実行手順", "意思決定", "再利用できる型"],
        "outputs": ["チェックリスト", "業務テンプレート", "判断フレーム"],
    },
    "転職・キャリア": {
        "focus": ["自己整理", "選択肢比較", "準備", "行動計画"],
        "outputs": ["自己分析シート", "面接質問集", "応募前チェックリスト"],
    },
    "恋愛・人間関係": {
        "focus": ["状況整理", "コミュニケーション", "境界線", "実行可能な行動"],
        "outputs": ["振り返りシート", "会話例", "状況別チェックリスト"],
    },
    "美容・自分磨き": {
        "focus": ["習慣化", "比較基準", "注意点", "無理のない実践"],
        "outputs": ["習慣チェックリスト", "比較表", "30日計画"],
    },
    "学習・資格": {
        "focus": ["学習計画", "復習", "つまずき対策", "進捗確認"],
        "outputs": ["学習計画表", "復習チェックリスト", "30日ロードマップ"],
    },
    "子育て・教育": {
        "focus": ["状況別の選択肢", "家庭での実践", "無理のない継続"],
        "outputs": ["家庭用チェックリスト", "声かけ例", "振り返りシート"],
    },
    "節約・家計管理": {
        "focus": ["固定費", "支出の見える化", "優先順位", "継続"],
        "outputs": ["家計見直しシート", "固定費チェックリスト", "月次確認表"],
    },
    "ライフスタイル・暮らし": {
        "focus": ["日常で再現できる工夫", "手間と効果のバランス", "継続"],
        "outputs": ["実践チェックリスト", "週間プラン", "比較表"],
    },
    "ガジェット・PC・デジタル": {
        "focus": ["用途", "比較軸", "向いている人・向かない人", "購入判断"],
        "outputs": ["比較表", "購入判断チェックリスト", "用途別選び方"],
    },
    "趣味・エンタメ": {
        "focus": ["楽しみ方", "初心者の入り口", "選び方", "継続"],
        "outputs": ["初心者チェックリスト", "比較表", "おすすめの進め方"],
    },
}

QUALITY_RULES = {
    "速さ優先": ["必要十分な情報量に絞り、構成を複雑にしすぎない。"],
    "標準": ["具体性と読みやすさのバランスを取る。"],
    "高品質": ["主張の一貫性、具体性、反対条件、実践可能性まで丁寧に確認する。"],
}

BONUS_LABELS = {
    "checklist": "チェックリスト",
    "template": "テンプレート",
    "worksheet": "ワークシート",
    "copy_paste_prompt": "コピペ用プロンプト",
    "roadmap": "ロードマップ",
    "comparison_table": "比較表",
    "decision_framework": "判断フレーム",
}


@dataclass
class WebAIContext:
    provider: str = "ChatGPT"
    quality: str = "標準"
    model_label: str = ""


def _get(data: Any, key: str, default: Any = "") -> Any:
    if isinstance(data, dict):
        return data.get(key, default)
    return getattr(data, key, default)


def _article_type(request: Any) -> str:
    return str(_get(request, "article_type", "無料") or "無料")


def _platform(request: Any) -> str:
    return str(_get(request, "platform", "note") or "note")


def _genre(request: Any) -> str:
    return str(_get(request, "genre", "") or "")


def _experience(request: Any) -> str:
    for key in ("experience_text", "personal_experience", "user_experience_text"):
        value = str(_get(request, key, "") or "").strip()
        if value:
            return value
    return ""


def _base_lines(request: Any, context: WebAIContext) -> list[str]:
    lines = ["あなたは日本語の記事編集・執筆アシスタントです。", "", "【最優先ルール】"]
    lines += [f"- {x}" for x in COMMON_RULES]
    lines += ["", f"【使用環境】Web AI: {context.provider}"]
    if context.model_label:
        lines.append(f"- ユーザーがWeb側で選ぶ予定のモデル/モード: {context.model_label}")
    lines += [f"- {x}" for x in PROVIDER_RULES.get(context.provider, PROVIDER_RULES["その他"])]
    lines += ["", f"【掲載先】{_platform(request)}"]
    lines += [f"- {x}" for x in PLATFORM_RULES.get(_platform(request), PLATFORM_RULES["その他"])]
    lines += ["", f"【生成品質】{context.quality}"]
    lines += [f"- {x}" for x in QUALITY_RULES.get(context.quality, QUALITY_RULES["標準"])]
    return lines


def _condition_lines(request: Any) -> list[str]:
    pairs = [
        ("ジャンル", _genre(request)),
        ("サブジャンル", _get(request, "subgenre", "AIおまかせ")),
        ("対象年代", _get(request, "target_age", "AIおまかせ")),
        ("対象性別", _get(request, "target_gender", "指定なし")),
        ("記事タイプ", _article_type(request)),
        ("文字量", _get(request, "length_mode", "AIおまかせ")),
        ("文体", _get(request, "writing_style", _get(request, "style", "AIおまかせ"))),
        ("切り口", _get(request, "angle", "AIおまかせ")),
    ]
    lines = ["【記事条件】"]
    for label, value in pairs:
        if str(value or "").strip():
            lines.append(f"- {label}: {value}")
    exp = _experience(request)
    if exp:
        lines += ["- ユーザーが明示した実体験:", f"  {exp}", "- 実体験として書いてよいのは上記に含まれる内容だけ。"]
    else:
        lines.append("- 実体験の入力なし。体験談を一人称の事実として作らない。")
    return lines


def _genre_lines(request: Any) -> list[str]:
    profile = GENRE_VALUE_PROFILES.get(_genre(request))
    if not profile:
        return []
    lines = ["【ジャンル別の価値設計】"]
    lines.append("- 重視: " + " / ".join(profile.get("focus", [])))
    lines.append("- 有料記事で相性のよい成果物候補: " + " / ".join(profile.get("outputs", [])))
    return lines


def _paid_lines(request: Any) -> list[str]:
    if _article_type(request) != "有料":
        return ["【無料記事】", "- 全文を無料記事として完結させる。有料境界を入れない。"]
    price = str(_get(request, "price", "AIおすすめ") or "AIおすすめ")
    return [
        "【有料記事】",
        f"- 設定価格: {price}円（AIおすすめの場合は価格を断定せず内容との釣り合いを優先）",
        "- 無料部分だけでも役立つ内容を入れる。",
        "- 有料境界の直前に、有料部分で得られる具体的な成果物・判断材料・実践内容を自然に示す。",
        "- 有料部分は無料部分の言い換えや水増しにしない。",
        "- 読了後に使える成果物を少なくとも1つ入れる。ただし不自然に増やしすぎない。",
    ]


def build_title_prompt(request: Any, context: WebAIContext) -> str:
    lines = _base_lines(request, context) + [""] + _condition_lines(request) + [""] + _genre_lines(request)
    lines += [
        "",
        "【依頼】",
        "上の条件に合う記事タイトル候補を5件作ってください。",
        "読者、悩みまたは目的、記事で得られることが分かる具体的なタイトルを優先してください。",
        "誇張、成果保証、根拠のない数字、クリックだけを狙う煽りは避けてください。",
        "",
        "【出力形式】",
        "1. タイトル",
        "2. タイトル",
        "3. タイトル",
        "4. タイトル",
        "5. タイトル",
        "",
        "前置き・解説・評価コメントは不要です。",
    ]
    return "\n".join(x for x in lines if x is not None)


def build_final_article_prompt(request: Any, selected_title: str, context: WebAIContext) -> str:
    title = selected_title.strip()
    if not title:
        raise ValueError("selected_title is required")
    lines = _base_lines(request, context) + [""] + _condition_lines(request) + [""] + _genre_lines(request) + [""] + _paid_lines(request)
    lines += [
        "",
        "【採用タイトル】",
        title,
        "",
        "【記事作成】",
        "採用タイトルと条件に一致する、掲載可能な完成記事を書いてください。",
        "導入では対象読者とこの記事で分かることを明確にし、結論を不必要に引き延ばさないでください。",
        "H2/H3、箇条書き、STEP、表は内容上必要な場合だけ使用してください。",
        "各見出しでは具体的な説明と実行可能な次の行動を優先してください。",
        "",
        "【出力形式】",
        f"# {title}",
        "導入本文",
        "## 見出し",
        "本文",
        "### 小見出し（必要な場合のみ）",
        "本文",
    ]
    if _article_type(request) == "有料":
        lines += [
            "",
            "---",
            "🔒 ここから有料",
            "---",
            "",
            "## 有料部分の見出し",
            "無料部分より一段深い実践内容",
            "",
            "## 🎁 特典",
            "ジャンルと本文に合う、実際に使える成果物",
        ]
    lines += ["", "## まとめ", "本文", "", "自然なCTA", "", "記事本文以外の説明は出力しないでください。"]
    return "\n".join(x for x in lines if x is not None)


def build_repair_prompt(article_text: str, repair_type: str, request: Any, context: WebAIContext) -> str:
    allowed = {
        "missing_titles",
        "bad_title_format",
        "missing_paid_boundary",
        "weak_paid_value",
        "missing_bonus",
        "missing_cta",
        "excessive_preamble",
        "incomplete_article",
        "formatting_only",
    }
    if repair_type not in allowed:
        raise ValueError(f"unsupported repair_type: {repair_type}")
    repair_instructions = {
        "missing_titles": "タイトル候補を5件に不足なく整え、番号付き5行だけ返す。",
        "bad_title_format": "タイトル候補の内容をできるだけ保持し、番号付き5行の形式だけに直す。",
        "missing_paid_boundary": "本文の内容を変えず、有料記事として自然な位置に有料境界を1か所追加する。",
        "weak_paid_value": "無料部分の繰り返しになっている有料部分だけを、実践手順・判断基準・成果物が増えるよう改善する。",
        "missing_bonus": "記事ジャンルに合う実用的な特典を1つ追加する。本文の水増しはしない。",
        "missing_cta": "記事内容に合う自然で控えめなCTAを末尾に追加する。",
        "excessive_preamble": "記事本文の前にあるメタ説明や不要な前置きだけ削除する。",
        "incomplete_article": "途切れている箇所から自然に続きを補い、記事を完結させる。既存部分は不要に書き直さない。",
        "formatting_only": "意味・主張・事実関係を変えず、見出し・箇条書き・改行・STEP・表記だけ整える。",
    }
    lines = _base_lines(request, context) + [
        "",
        "【修正方針】",
        "全文を作り直さず、必要最小限の範囲だけ修正してください。",
        "元の主張や事実関係を勝手に増やさないでください。",
        f"- 修正内容: {repair_instructions[repair_type]}",
        "",
        "【元の出力】",
        article_text.strip(),
        "",
        "【出力】",
        "修正後の内容だけ返してください。",
    ]
    return "\n".join(lines)
