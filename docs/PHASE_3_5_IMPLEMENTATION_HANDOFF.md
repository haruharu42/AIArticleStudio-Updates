# Phase 3.5 Implementation Handoff

## 1. この文書の役割

Sol 設計工程からコーディング担当へ渡す実装指示。

実装担当は仕様を勝手に簡略化せず、ユーザーの通常操作をシンプルに保ちながら内部ロジックを追加する。

## 2. 実装単位

### 3.5-B1 Web AI モデル設定外部化

実装:
- `web_ai_models.json` ローダー
- HTTPS取得
- 24hキャッシュ
- 最小フォールバック
- provider変更時のmodel再構築
- quality→model同期
- model→quality同期

テスト:
- ネット接続あり
- ネット接続なし
- JSON破損
- unknown model
- disabled model
- provider変更

### 3.5-B2 プロンプト組み立てエンジン

推奨構成:

```text
prompt_builder/
  common.py
  providers.py
  platforms.py
  genres.py
  paid.py
  quality.py
  builder.py
```

公開関数案:

```python
build_title_prompt(article_request, web_ai_context) -> str
build_final_article_prompt(article_request, selected_title, web_ai_context) -> str
build_repair_prompt(article_state, repair_type) -> str
```

ハードコードした巨大文字列1個にしない。

### 3.5-B3 ジャンル成果物エンジン

データとして管理する。

```python
GENRE_VALUE_PROFILES = {
    "AI副業": {
        "preferred_outputs": [...],
        "article_focus": [...],
        "avoid_patterns": [...],
    }
}
```

後からJSON化できる構造にする。

### 3.5-B4 有料価値・特典

UI:
- 無料選択時は有料設定を完全非表示
- 有料選択時だけ「特典を付ける」表示
- 初期値 AIおまかせ
- 詳細設定で種類を選択可能

データ:

```text
bonus_enabled
bonus_mode
bonus_items[]
paid_price_jpy
free_section_amount
paid_section_amount
paid_boundary_mode
cta_strength
```

### 3.5-B5 Web AI 回答取り込み

保存:
- raw_web_output
- normalized_output

元データを破壊しない。

パーサー:
- title candidate parser
- wrapper remover
- markdown fence remover
- paid boundary detector
- bonus detector

### 3.5-B6 Repair 導線

UIに技術エラーを直接見せない。

例:

```text
タイトル候補がうまく読み取れませんでした。
[もう一度生成する] [手入力する] [回答をそのまま確認]
```

AI修正が必要な場合:

```text
[修正用プロンプトをコピー]
```

### 3.5-B7 状態保存 / 再開

保存タイミング:
- 入力変更時 debounce
- step移動時
- タイトル選択時
- Web回答貼付時
- 整形時
- アプリ終了時

再開:
- Homeに「続きから」カード
- 最後のstepへ戻す

### 3.5-B8 掲載完了導線

完了画面:

```text
[掲載用をコピー]
[プレビュー]
[Markdown保存]

掲載先へ
[noteを開く] [Tipsを開く] [Brainを開く]
```

選択中のplatformを第一ボタンとして強調する。

## 3. UI 原則

- 初心者向け表示を優先
- 内部モデル名やルーティング情報を常時見せない
- 高度な設定は折りたたみ
- 1画面の主要CTAは1つ
- 同じ意味のボタンを重複配置しない
- APIモードの項目をWeb AI画面に出さない
- Web AIモードではAPI残高警告を主表示しない

## 4. データモデル追加候補

```text
web_ai.provider
web_ai.quality
web_ai.model_id
web_ai.model_label
web_ai.model_config_version
web_ai.chat_guidance
web_ai.raw_output
web_ai.normalized_output
web_ai.repair_history[]

prompt.prompt_profile_version
prompt.platform_profile_version
prompt.genre_profile_version

publishing.target_platform
publishing.formatted_output
publishing.last_copied_at
publishing.launch_history[]
```

既存DB migrationは破壊的変更禁止。

## 5. テストケース

最低限:

1. note / 無料 / ChatGPT / 標準
2. note / 有料 / Claude / 高品質
3. Tips / 有料 / Gemini / 標準
4. Brain / 有料 / ChatGPT / 高品質
5. blog / 無料 / その他
6. 実体験なしで本人経験が生成指示に入らない
7. タイトル回答が 1〜5 形式
8. タイトル回答が ①〜⑤ 形式
9. 3件しか返らない場合のRepair
10. コードフェンス付き本文
11. 有料境界がない本文
12. モデルJSON取得失敗
13. キャッシュ利用
14. アプリ終了→再開
15. note/Tips/Brainリンク起動

## 6. Acceptance Criteria

### AC-01
Web版AIを選んだ状態でAPIキーがなくてもタイトル〜完成画面まで進める。

### AC-02
quality変更後、選択providerの推奨modelが即時反映される。

### AC-03
model変更後、対応qualityが即時反映される。

### AC-04
モデル設定サーバー障害でも記事作成を継続できる。

### AC-05
無料記事では有料設定が表示されない。

### AC-06
有料記事では最低1つ以上の実用成果物を要求するプロンプトになる。

### AC-07
ユーザー実体験が空なら、本人経験を創作しない制約が入る。

### AC-08
AI回答の原文と整形版を別々に保持する。

### AC-09
途中終了後、最後の主要stepへ復帰できる。

### AC-10
完成画面からnote/Tips/Brainの公式サイトを開ける。

## 7. リリース条件

実装完了後すぐstableへ出さない。

1. 開発コピーへ適用
2. unit test
3. UTF-8 / PowerShell 5.1 検証
4. ZIP integrity
5. SHA256
6. GitHub Actions pass
7. 実機で `check` / `update`
8. アプリ起動
9. 代表5シナリオを手動確認
10. stable manifest更新

## 8. Sol に戻すタイミング

以下のどれかでSolレビューへ戻す。

- プロンプト仕様と実装がズレた
- 有料価値の出力が薄い
- ジャンル差がほぼ出ない
- UIが複雑化した
- エラー回復が分かりにくい
- 実運用5シナリオ完了後

## 9. Phase 3.5-C Sol 最終監査項目

- 初心者が迷わないか
- APIなしで本当に完走できるか
- AIごとの差が過剰/不足でないか
- note/Tips/Brain差が出ているか
- 無料記事が出し惜しみになっていないか
- 有料記事に実用価値があるか
- 架空実体験が混ざらないか
- 最新確認が必要な情報を断定しないか
- 記事が水増しされていないか
- 完成後の掲載操作が3〜4操作程度に収まるか
