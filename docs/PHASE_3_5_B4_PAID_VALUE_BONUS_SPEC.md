# Phase 3.5-B4 有料記事・特典価値エンジン仕様

## 1. 目的

有料記事を「無料記事を長くしただけ」にしない。読者が購入後に実行・判断・再利用できる成果物を持ち帰れる構成を、ジャンル・価格・読者・掲載先に応じて設計する。

このエンジンは販売保証をしない。目的は、無料部分と有料部分の役割を明確にし、価格に対して内容が薄い状態・煽りすぎ・架空実績を防ぐことである。

## 2. 基本原則

- 無料部分だけでも読者が「役に立った」と感じられる情報を含める
- 有料部分は無料部分の言い換え・水増しにしない
- 有料部分には最低1つ以上の実用成果物を含める
- 実体験・実績・レビュー・収益・効果はユーザー入力がない限り創作しない
- 価格・仕様・制度・キャンペーン等の時点依存情報を推測で作らない
- 強い断定、成功保証、過度な希少性演出を避ける
- 記事の価値は文字数ではなく「具体性・実行可能性・再利用性」で評価する

## 3. データモデル

```python
PaidValueProfile = {
    "enabled": bool,
    "price_jpy": int | None,
    "price_mode": "ai_recommend" | "manual",
    "reader_outcome": str,
    "free_value": list[str],
    "paid_value": list[str],
    "value_elements": list[str],
    "actionable_outputs": list[dict],
    "bonus_enabled": bool,
    "bonus_mode": "auto" | "manual" | "off",
    "bonus_items": list[dict],
    "free_paid_difference": str,
    "boundary_strategy": "early" | "standard" | "late" | "manual",
    "cta_strength": "soft" | "natural" | "standard" | "strong",
    "price_fit": "good" | "thin" | "overbuilt" | "unknown",
    "missing_value_elements": list[str],
    "warnings": list[str],
}
```

### value_elements 候補

- practical_steps
- template
- checklist
- worksheet
- comparison
- case_example
- failure_example
- decision_framework
- copy_paste_prompt
- roadmap
- primary_experience
- original_data
- advanced_tips

## 4. 成果物オブジェクト

```python
ActionableOutput = {
    "type": str,
    "title": str,
    "purpose": str,
    "content_requirements": list[str],
    "placement": "paid_main" | "bonus" | "appendix",
    "reusable": bool,
    "copy_paste_ready": bool,
}
```

成果物は「ある」と書くだけではなく、完成内容まで生成させる。

悪い例:
- 特典としてチェックリストを付けます

良い例:
- 実際に使える10項目のチェックリスト本文を生成する

## 5. ジャンル別の価値設計

### AI・生成AI / AI副業

優先:
- practical_steps
- copy_paste_prompt
- checklist
- template
- roadmap

例:
- そのまま使えるプロンプト
- 作業開始前チェックリスト
- 7日 / 30日実践ロードマップ
- 案件ヒアリングテンプレート

禁止:
- 架空の月収実績
- 再現性を保証する表現

### note・コンテンツ販売

優先:
- template
- checklist
- decision_framework
- copy_paste_prompt
- roadmap

例:
- 記事構成テンプレート
- 有料境界チェックリスト
- タイトル改善プロンプト
- 公開前チェックシート

### SNS・情報発信

優先:
- template
- checklist
- roadmap
- case_example

例:
- 投稿テンプレート
- 30日投稿計画
- 投稿前チェックリスト

### YouTube・動画制作

優先:
- checklist
- template
- workflow
- roadmap

例:
- 台本テンプレート
- 投稿前確認表
- 企画選定フレーム

### キャリア・転職

優先:
- worksheet
- checklist
- decision_framework
- template

例:
- 自己分析シート
- 面接質問集
- 職務経歴書チェックリスト

注意:
- 採用成功を保証しない

### 学習・資格

優先:
- roadmap
- worksheet
- checklist
- template

例:
- 30日学習計画
- 復習チェック表
- 学習記録シート

### 節約・家計

優先:
- worksheet
- checklist
- comparison
- decision_framework

例:
- 固定費見直し表
- 月次家計チェック
- 比較観点シート

注意:
- 投資助言へ踏み込まない

### ガジェット・PC・デジタル

優先:
- comparison
- decision_framework
- checklist

例:
- 用途別比較表
- 購入判断チェックリスト
- 向いている人 / 向いていない人

禁止:
- 未確認の価格・在庫・スペック・レビュー・評価の創作

## 6. 無料部分と有料部分の役割

### 無料部分

必須:
- 読者の悩みを具体化
- 記事で得られるものを明示
- 基本知識または最初の1歩を提供
- 「有料を買わないと何も分からない」状態にしない

### 有料部分

必須:
- 具体手順
- 判断基準
- 失敗回避
- 応用または実践
- 最低1つの再利用可能成果物

有料境界直前は煽るのではなく、以下を明示する。

1. ここまでで分かったこと
2. ここから先で扱う内容
3. 読むと何を実行できるようになるか
4. 読まなくても無料部分が無価値にならないこと

## 7. 価格適合判定

価格は価値を保証するものではない。以下は内部評価のための目安とする。

### 低価格帯

必要条件:
- 明確な1テーマ
- 実践手順
- 小さくても完成した成果物1つ以上

### 中価格帯

必要条件:
- 複数ステップ
- 判断基準または失敗回避
- 成果物2つ以上を推奨
- 読者が再利用できるテンプレート等

### 高価格帯

必要条件:
- 深い実践構造
- 複数成果物
- ケース例または比較
- ロードマップ / フレームワーク
- 価格に見合う明確な実行可能性

高価格だから文章量を増やす、というロジックは禁止。

### price_fit 判定

- good: 価格に対して成果物・具体性・実行性が十分
- thin: 価格に対して価値要素が不足
- overbuilt: 価格に対して内容過多。分割・シリーズ化候補
- unknown: 情報不足

## 8. AIおまかせ特典選択アルゴリズム

入力:
- genre
- subgenre
- article_goal
- target_reader
- price_jpy
- article_length
- existing_value_elements
- user_experience_text

処理:

1. ジャンル候補から優先成果物を取得
2. 本文ですでに提供する成果物と重複するものを除外
3. 読者の次の行動に最も直結するものを優先
4. 価格帯に応じて必要数を決める
5. 生成コストではなく有用性を優先
6. 無理に数を増やさない
7. ユーザー実体験がない場合、体験談型特典を候補から外す

推奨数:
- 低価格: 1
- 中価格: 1〜2
- 高価格: 2〜3

上限3。量より完成度を優先する。

## 9. 重複防止

本文・特典間で以下をチェックする。

- 同じチェック項目の再掲
- 同じ手順の言い換え
- まとめの過剰再掲
- 特典が本文のコピーになっていないか

重複がある場合は全文再生成ではなく、特典だけ差し替える。

## 10. プロンプトへの注入契約

PaidValueProfile を完成記事プロンプトへ次の順序で渡す。

```text
[PAID ARTICLE VALUE CONTRACT]
Reader outcome: ...
Free section value: ...
Paid section additional value: ...
Required actionable outputs:
- ...
Bonus requirements:
- ...
Boundary strategy: ...
Price-fit constraints: ...
Do not fabricate experience/results/prices/reviews.
```

AIへ「売れるように煽って」と指示しない。
「購入判断に必要な価値差を明確にする」と表現する。

## 11. UI仕様

無料記事:
- 有料記事設定は表示しない

有料記事:
- 価格
- 無料部分の量
- 有料部分の量
- 有料境界位置
- CTA強度
- 特典を付ける ON/OFF

特典ON時:
- AIおまかせ（初期値）
- チェックリスト
- テンプレート
- ワークシート
- コピペ用プロンプト
- ロードマップ
- 比較表
- 判断フレーム
- 自分で指定

通常画面では詳細説明を増やしすぎない。

## 12. 監査ルール

有料記事完成時、最低限以下を内部監査する。

- free_section_has_value
- paid_section_adds_new_value
- actionable_output_present
- bonus_is_complete
- bonus_not_duplicate
- price_fit_not_thin
- no_fake_experience
- no_fake_results
- no_fake_price_or_review
- no_guaranteed_outcome
- cta_not_excessive

重大違反が1つでもある場合 `NEEDS_REVISION`。

## 13. B5回答取り込みへの出力契約

B5は以下を検出できるようにする。

- paid_boundary_detected
- bonus_headings[]
- actionable_outputs_detected[]
- summary_detected
- cta_detected

B4は「生成要件」、B5は「実際の出力に存在するか」の検出を担当する。

## 14. 完成条件

- 無料/有料でUIとプロンプトが分離される
- PaidValueProfile を生成できる
- ジャンル別成果物候補が選べる
- AIおまかせで特典候補が最大3つに絞られる
- 価格適合を判定できる
- 本文と特典の重複を検出できる
- 架空実績・レビュー・価格を要求しない
- B5へ検出契約を渡せる
