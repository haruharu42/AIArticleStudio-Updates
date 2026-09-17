# AI Article Studio — PWA First Product Strategy

更新日: 2026-09-12

## 1. 方針決定

AI Article Studioは、今後 **PWA版を主製品（Primary Product）** として開発・販売準備・UX改善を進める。

Windows版は廃止しない。ただし、PWAとの完全な機能同等化を追う並行開発は停止し、**保守モード（Maintenance Mode）** へ移行する。

この方針変更は、既存のSupabase Auth、profiles、entitlements、RLS、articles、article_workspaces、article_assets、private Storageなどの共通クラウド基盤を活かすものであり、基盤を作り直すものではない。

## 2. 製品の位置づけ

### PWA版

PWA版を一般ユーザー向けの標準製品とする。

優先対象:

- 新規登録・ログイン・利用権確認
- 記事作成
- 記事ライブラリ
- 記事編集・Workspace
- アイキャッチ・挿絵の計画、画像資産管理
- ChatGPT / ChatGPT Work / ChatGPT Images / Codexへの公式導線
- SNS投稿作成
- AI副業プランナー
- SNSアカウント設計
- 公開管理
- コンテンツ分析
- スマホ・PCブラウザ共通UI
- ホーム画面追加（PWA install）
- 販売・オンボーディング

新機能は原則としてPWAへ先に実装する。

### Windows版

Windows版は当面、既存ユーザー向けの保守対象とする。

継続する作業:

- Auth / Google OAuth / PKCE / DPAPIの重大不具合修正
- Updater、latest.json、SHA256検証の維持
- データ損失につながる不具合の修正
- セキュリティ修正
- OS互換性上の重大問題
- 既存のWindows利用権の維持

原則停止する作業:

- PWAで追加した機能をWindowsへ機械的に移植すること
- Windows専用UIの大規模刷新
- PWAとWindowsの完全な画面・機能パリティ追跡
- 明確な利用需要が確認されていないローカル専用機能の追加

## 3. 既存ユーザー保護

今回の方針変更だけを理由に以下を変更しない。

- 既存Windowsユーザーの利用権
- `AAS-WIN-BETA` entitlement
- Windows版のログイン可否
- Windows版の既存記事・ローカルデータ
- 管理者の既存権限

Windows版を購入済みのユーザーを自動的にPWA契約へ移行したり、逆にPWA契約をWindowsへ自動付与したりしない。

販売体系・価格・既存購入者への移行特典などは、別の明示的な販売方針決定として扱う。

## 4. 開発リソース配分

当面の目安:

- PWA: 85〜90%
- Windows保守: 10〜15%

重大なWindows不具合が発生した場合は例外的にWindowsを優先する。

## 5. 新ロードマップ

### Phase P0 — 方針固定・基準化

状態: 現在

- PWA First方針を正式記録
- WindowsをMaintenance Modeへ移行
- 既存セキュリティ境界を維持
- 現在のPWA UI改善PRを優先トラックとして扱う

完了条件:

- 戦略文書とGitHub Issueが存在する
- 新規機能の優先順位がPWA中心に更新される

### Phase P1 — 初心者向けPWA UX完成

対象:

- PR #48
- 白基調＋青アクセント
- 初心者が見ただけで操作を理解できるホーム
- 記事作成 / ライブラリ / 画像 / SNSの整理
- 下部ナビの簡素化
- ジャンル・サブジャンル・年齢・性別・文字数等のプルダウン復元
- OpenAI公式ツールへの導線

完了条件:

- CI / Production Preflight PASS
- Cloudflare Previewへ反映
- iPhone Safari / standalone PWA / PCブラウザで実機確認

### Phase P2 — PWA実機E2E完成

対象:

- ログイン
- entitlement ON/OFF
- 記事作成
- 記事編集
- Workspace保存
- 画像アップロード / 置換 / 削除
- `/images`導線
- OpenAIリンク
- SNS機能
- 公開管理
- 分析
- ホーム画面追加と再起動

完了条件:

- iPhone / PCブラウザで主要導線PASS
- テストデータ残骸0
- 既知のBlockerなし

### Phase P3 — 販売・オンボーディング完成

対象:

- PWAを標準商品として説明できる販売導線
- 招待 / 利用権付与
- 登録→メール確認→管理者承認→利用開始の明確化
- エラー時の初心者向け説明
- 利用開始ガイド
- FAQ

注意:

販売チャネル、価格、返金条件、既存Windows購入者の扱いは別途確定する。

### Phase P4 — 法務・公開前基盤

対象:

- 利用規約
- プライバシーポリシー
- AI利用条件
- 必要に応じて特定商取引法表記
- 運営者情報
- 問い合わせ導線
- production URL / custom domainの最終決定

完了条件:

- 仮文言を本番情報へ置換
- Production routing切替前レビュー完了

### Phase P5 — PWA正式公開

対象:

- Production routing
- custom domain（採用する場合）
- production smoke test
- Auth callback
- Service Worker
- manifest
- legal routes
- invite / entitlement
- article / image E2E

完了条件:

- 本番URLで主要E2E PASS
- 重大エラーなし
- rollback手順確認済み

### Phase P6 — 販売後改善

対象:

- 実ユーザーの離脱ポイント
- 記事作成完了率
- 画像作成導線
- OpenAIへの遷移導線
- SNS機能利用率
- FAQ / UI文言改善
- パフォーマンス
- モバイル操作性

新機能は利用実績と問い合わせを見て優先順位を決める。

### Phase P7 — Windows再定義判断

PWA公開後、実需要が確認された場合のみ検討する。

候補:

- Desktop Pro
- Local Tools
- GPU / ローカル画像生成
- 大量ファイル処理
- ローカルLLM
- フォルダ監視
- 一括Markdown / Word出力
- ローカルバックアップ

これらに明確な需要がなければ、Windows版は安定保守を継続する。

## 6. アーキテクチャ原則

PWA Firstへ移行しても次を維持する。

- クライアントへservice_roleを配布しない
- RLSを維持する
- adminも他ユーザーの記事/画像へ直接アクセスしない
- entitlementはWindows/PWAで明示的に管理する
- private Storageを維持する
- Auth / profiles / AAS ID / role / statusを共通基盤とする
- WindowsとPWAの共有データはクラウドを正とする

## 7. 当面の実装優先順位

1. PR #48を完成させる
2. 新UIをCloudflare Previewへ反映
3. iPhoneとPCでPWA UX/E2Eを確認
4. PWA販売・利用開始フローを完成
5. 法務文書を本番化
6. Production routingを決定
7. PWA正式公開
8. 公開後データを見て改善
9. Windowsは重大修正のみ対応

## 8. 非目標

この方針変更では以下を行わない。

- Windows版の即時廃止
- 既存Windows entitlementの取り消し
- Windowsユーザーの強制PWA移行
- Supabaseの全面再設計
- 記事DB/Storageの作り直し
- Cloudflare production routingの即時有効化
- 価格・販売条件の自動変更

## 9. 成功条件

AI Article Studioが「WindowsアプリとPWAを2本並行で維持する製品」ではなく、

**PWAを中心に、スマホ・PCブラウザから同じ記事制作環境を使えるクラウド型AI制作プラットフォーム**

として一貫して設計・販売・改善されていることを成功条件とする。
