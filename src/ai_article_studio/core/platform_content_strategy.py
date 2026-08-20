from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PlatformContentStrategy:
    key: str
    reader_expectation: tuple[str, ...]
    free_article: tuple[str, ...]
    paid_article: tuple[str, ...]
    title_guidance: tuple[str, ...]
    structure_guidance: tuple[str, ...]
    value_signals: tuple[str, ...]
    avoid: tuple[str, ...]


# Research refresh: 2026-08-20.
# These profiles intentionally encode durable editorial patterns, not volatile
# rankings or sales numbers. Time-sensitive trend data should be refreshed
# separately instead of being hard-coded into article claims.
PLATFORM_STRATEGIES: dict[str, PlatformContentStrategy] = {
    "note": PlatformContentStrategy(
        key="note",
        reader_expectation=(
            "人柄や経験が感じられる自然な読み物として読める",
            "無料部分だけでも一つ以上の気づき・行動を持ち帰れる",
            "実用記事では悩み解決までの道筋が具体的である",
        ),
        free_article=(
            "冒頭で読者の状況を具体化し、この記事で分かることを早めに示す",
            "結論を不必要に引き延ばさず、本文単体で満足できる内容にする",
            "最後は関連記事・フォロー・次の行動のいずれかへ自然につなぐ",
        ),
        paid_article=(
            "無料部分で信頼と価値を実証し、購入判断に必要な情報を隠しすぎない",
            "有料部分で得られる成果・対象読者・具体的な内容を境界前に明示する",
            "有料部分は無料部分の繰り返しではなく、手順・具体例・テンプレート・判断基準など実行可能性を深める",
        ),
        title_guidance=(
            "テーマと読者メリットが一目で分かる",
            "数字や実績はユーザー提供または検証可能な事実だけを使う",
            "煽りよりも具体性・対象読者・変化を優先する",
        ),
        structure_guidance=(
            "短めの導入→要点→具体例/手順→まとめの流れを基本にする",
            "エッセイ系は余韻、実用系は再現可能な行動を重視する",
        ),
        value_signals=("本人ならではの経験", "課題解決", "具体的な手順", "再利用できる成果物"),
        avoid=("無料部分を薄い宣伝だけにする", "有料境界まで結論を隠すだけの構成", "根拠のない成功保証"),
    ),
    "Tips": PlatformContentStrategy(
        key="Tips",
        reader_expectation=(
            "購入後にすぐ実行できる教材・ノウハウとして使える",
            "対象となる悩みと到達点が明確である",
            "手順・テンプレート・事例など時間短縮につながる要素がある",
        ),
        free_article=(
            "問題、対象読者、得られる結果、全体像を早めに示す",
            "無料記事でも単独で役立つ具体策を含める",
        ),
        paid_article=(
            "販売ページ相当の無料部分で、誰向けか・何が得られるか・何を扱うかを具体化する",
            "本文はロードマップ、手順、チェックリスト、テンプレート、失敗回避を優先する",
            "高価格ほど情報量ではなく、実行時間の短縮・再利用性・具体的成果物で価値を補強する",
        ),
        title_guidance=(
            "対象読者・テーマ・成果・方法のうち2〜3要素を明確にする",
            "『完全版』『攻略』などの強い語は内容が実際に網羅している場合だけ使う",
        ),
        structure_guidance=(
            "悩み→結論→得られるもの→全体像→実践手順→テンプレート/チェック→まとめを基本にする",
            "長文でも同じ主張の言い換えを避け、章ごとに役割を持たせる",
        ),
        value_signals=("一人の具体的な悩み", "実体験", "ロードマップ", "テンプレート", "時間短縮"),
        avoid=("誇大な収益保証", "中身のない高額化", "レビューや販売数の捏造"),
    ),
    "Brain": PlatformContentStrategy(
        key="Brain",
        reader_expectation=(
            "講座・教材に近い密度で体系化されている",
            "購入後の行動順序と到達点が明確である",
            "AI・SNS・ビジネス等では実務に直結する再利用可能な資産がある",
        ),
        free_article=(
            "対象読者、現状の課題、得られる変化、内容の全体像を明示する",
            "販売訴求だけでなく、無料部分でも専門性や具体性を示す",
        ),
        paid_article=(
            "基礎→実践→応用→チェックの順に体系化する",
            "テンプレート、プロンプト、チェックリスト、判断フレームなどを本文と連動させる",
            "高単価を想定する場合ほど、誰に向かないか・前提条件・限界も明示する",
        ),
        title_guidance=(
            "何の教材か、誰向けか、何をできるようにするかを具体化する",
            "実績・部数・順位は検証可能な入力がある場合だけ使う",
        ),
        structure_guidance=(
            "販売ページ→ロードマップ→各ステップ→実例/テンプレート→実行チェックの流れを基本にする",
            "章ごとのアウトプットを明確にする",
        ),
        value_signals=("体系化", "実践ロードマップ", "テンプレート", "具体例", "再現条件"),
        avoid=("権威づけの捏造", "収益額の捏造", "強い煽りだけで購入を迫る"),
    ),
    "ブログ": PlatformContentStrategy(
        key="ブログ",
        reader_expectation=("検索意図へ素早く答える", "読み飛ばしても要点を拾える", "一次情報や根拠が区別されている"),
        free_article=("冒頭で結論と対象読者を明確にする", "見出しごとに一つの検索意図へ答える"),
        paid_article=("必要な場合だけ追加価値を明示し、本文の検索意図を壊さない"),
        title_guidance=("検索者が知りたい主題とベネフィットを明確にする",),
        structure_guidance=("結論→理由→手順/比較→注意点→まとめ",),
        value_signals=("検索意図一致", "具体性", "根拠", "比較基準"),
        avoid=("結論の先延ばし", "キーワードの不自然な詰め込み"),
    ),
}


def get_platform_strategy(platform: str) -> PlatformContentStrategy:
    key = str(platform or "note").strip()
    return PLATFORM_STRATEGIES.get(key, PLATFORM_STRATEGIES["ブログ"])


def platform_prompt_lines(platform: str, article_type: str) -> list[str]:
    s = get_platform_strategy(platform)
    lines = [f"【{s.key}向け編集戦略】"]
    lines += [f"- 読者期待: {x}" for x in s.reader_expectation]
    selected = s.paid_article if article_type == "有料" else s.free_article
    lines += [f"- 記事設計: {x}" for x in selected]
    lines += [f"- 構成: {x}" for x in s.structure_guidance]
    lines += [f"- 避ける: {x}" for x in s.avoid]
    return lines
