# Web AI Model Config Specification

## 1. 目的

ChatGPT / Claude / Gemini などのモデル名変更を、アプリ本体のアップデートなしで追従できるようにする。

アプリコードへモデル名を固定値として埋め込まず、外部JSONから取得する。

## 2. 推奨配置

```text
https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/config/web_ai_models.json
```

安定運用後は署名またはハッシュ検証を追加する。

## 3. JSON 構造

```json
{
  "schema_version": 1,
  "config_version": "2026-08-19.1",
  "updated_at": "2026-08-19T00:00:00Z",
  "providers": {
    "ChatGPT": {
      "launch_url": "https://chatgpt.com/",
      "models": [
        {
          "id": "example-fast",
          "label": "Fast model",
          "quality": "fast",
          "enabled": true,
          "availability_note": "利用可能な場合のみ"
        }
      ],
      "default_by_quality": {
        "fast": "example-fast",
        "standard": "example-standard",
        "high": "example-high"
      }
    }
  }
}
```

※上記モデル名はスキーマ説明用の例であり、実際の配布値ではない。

## 4. quality 値

- fast
- standard
- high

UI表示:

- fast → 速さ優先
- standard → 標準
- high → 高品質

## 5. モデル項目

必須:

- id: 内部識別子
- label: UI表示名
- quality: 推奨品質
- enabled: 表示可否

任意:

- availability_note
- plan_note
- deprecated
- replacement_id
- prompt_profile
- sort_order

## 6. 双方向連動

### 品質 → モデル

1. providerを決定
2. `default_by_quality[quality]` を参照
3. enabled=true の対象モデルへ変更
4. 見つからない場合は、そのqualityの最初のenabledモデル
5. それもなければモデル未指定で続行

### モデル → 品質

1. 選択モデルの `quality` を取得
2. UIの生成品質を対応値へ変更
3. ユーザーが後から品質を変えた場合は再びdefault modelへ同期

## 7. Provider変更

Provider変更時:

1. providerのモデル一覧を再構築
2. 現在のqualityを維持
3. provider側のdefault_by_qualityを選択
4. 選択不可ならstandardを試す
5. それでも不可なら先頭enabledモデル

## 8. キャッシュ

保存先案:

```text
%LOCALAPPDATA%\AIArticleStudio\data\web_ai_models_cache.json
```

保存項目:

- downloaded_at
- source_url
- config_version
- payload

TTL目安: 24時間。

ただしユーザーが記事作成を開始するたび強制通信しない。

## 9. フォールバック

外部設定取得失敗時:

1. 最後に正常取得したキャッシュ
2. アプリ内の最小フォールバック設定
3. モデル自由入力

外部設定取得失敗で記事作成自体を停止しない。

## 10. セキュリティ

- HTTPSのみ
- 許可ホストを限定
- JSONサイズ上限を設ける
- launch_urlは許可ドメインだけ開く
- JSON内にPowerShellやPythonコードを置かない
- configはデータとして扱い、実行しない

## 11. モデル更新運用

モデル名の変更は次の順番で行う。

1. 公式情報確認
2. `web_ai_models.json` を更新
3. JSON schema validation
4. UI連動テスト
5. 公開

アプリ本体のバージョンアップは不要。

## 12. プラン依存モデル

利用プランによって表示されないモデルがあるため、`plan_note` または `availability_note` を表示可能にする。

アプリはユーザーのChatGPT等の契約プランを自動判定しない。

例:

```json
{
  "availability_note": "このモデルは契約プランによって表示されない場合があります。"
}
```

## 13. 「その他」Provider

- モデルプルダウンを固定しない
- モデル名を自由入力
- qualityはユーザー指定
- launch_urlもユーザー指定可能にする場合は、明示確認を入れる

初期リリースでは任意URL入力より「ブラウザを自分で開く」案内を優先する。
