# AI記事スタジオ PWA — Phase 9–17 implementation batch

Phase 8を安定基準として残したまま、PWAを「閲覧/編集中心」から「利用開始・管理・記事制作・SNS/公開管理・内部分析」まで拡張する開発ブランチです。

- Phase 9: PWA招待コードの登録画面と、購入・招待をPWA利用権へ変換するDB/RPC契約。
- Phase 10: active管理者向け共通管理画面。ユーザー承認/停止/再開、Windows/PWA利用権の付与/取消、販売チャネル・期限、PWA招待コードを管理。
- Phase 11: モバイル新規記事制作。生成方法 → 画像計画 → 本文条件 → タイトル → 本文生成 → プレビュー → 保存の7ステップ。
- Phase 12: 掲載先・無料/有料・ジャンル別の専門プロンプト。
- Phase 13: アイキャッチ/挿絵の画像プロンプト計画。
- Phase 14: X / Instagram / Threads用SNS投稿プロンプト。
- Phase 15: AI副業プランナーとSNSアカウント立ち上げ設計。
- Phase 16: 公開予定・公開URL・公開日時の管理。
- Phase 17: AAS内部の記事ストック・掲載先・状態などの分析。

既存のPhase 6 Auth/PKCE、Phase 7記事ライブラリ、Phase 8画像管理は置換せず維持します。記事作成は既存の`create_article_with_workspace`を使用し、記事・編集条件・画像計画を同じ所有者のWorkspaceへまとめて保存します。

## 開発中の入口

- `/` — 既存PWAホーム/記事ライブラリ/画像管理。
- `/invite` — PWA招待コード登録。
- `/admin` — active admin専用の共通ユーザー・利用権・招待管理。
- `/create` — 記事作成ウィザード。
- `/images` — 記事画像管理。
- `/sns` — SNS投稿変換。
- `/sns-plan` — SNSアカウント立ち上げ設計。
- `/sidejob` — AI副業プランナー。
- `/publish` — 公開状態・URL・予定日時管理。
- `/analytics` — AAS内部記事分析。
- `/export` — 掲載用本文/Markdown出力。
- `/tools` — 機能ハブ。

Phase 11以降の現段階では、直接AI APIを呼ばず「ChatGPTプロンプト書き出し」と手動作成を提供します。APIキー・課金方式・モデルルーティングをブラウザーへ埋め込まずに制作フローを完成させるためです。直接AI生成は秘密鍵をブラウザーへ置かないサーバー実行層で追加します。

## Phase 9/10 DB

本番Supabaseへ以下を適用済みです。

- `phase9_pwa_invites_admin`
- `phase9_pwa_invite_existing_entitlement_guard`
- `phase9_pwa_invite_profile_variable_fix`

追加対象:

- `pwa_invites`
- `pwa_invite_redemptions`
- `admin_create_pwa_invite`
- `admin_list_pwa_invites`
- `admin_revoke_pwa_invite`
- `redeem_pwa_invite`
- `admin_list_user_entitlements`

招待テーブル/履歴テーブルはpublic/anon/authenticatedから直接アクセス不可で、操作は認証済みRPCへ限定します。管理RPCは既存`private.is_active_admin()`を要求します。招待利用はpending/activeの一般ユーザーだけが行え、`AAS-PWA-BETA`だけを付与します。

本番E2Eでは、管理者による招待作成 → 一般ユーザーによるPWA利用権登録 → 別招待による既存有効利用権の上書き拒否を確認しました。試験データはロールバック/清掃済みで、E2E招待・利用履歴・一時PWA利用権は残していません。

## 開発と確認

Node.js 22.13.0以上。依存関係とlockfileは固定値を維持します。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm audit
```

GitHub Actionsの`PWA Phase 9-17 CI`で、型検査・lint・build・Phase 6–17回帰・dependency auditを検証します。

ローカルBrowser E2E用に次を追加しています。

```powershell
& .\scripts\Start-AAS-Phase9-17-BrowserE2E.ps1
```

これは安定版worktreeを変更せず、Downloads配下へ開発ブランチのisolated worktreeを作成し、インストール済み`config/auth.json`からブラウザー公開可能なSupabase URL/公開キーだけを環境変数へ読み込みます。キー値は表示せず、`127.0.0.1:5173`だけで起動し、主要ルートのHTTP 200 smoke test後にブラウザーを開きます。

終了後:

```powershell
& .\scripts\Stop-AAS-Phase9-17-BrowserE2E.ps1
```

## 公開設定

- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- 既存の利用規約・プライバシー・AI利用規約URL

秘密鍵・service role・ユーザーJWT・DPAPIセッションを設定やバンドルへ埋め込みません。

## 本番公開との境界

本番SupabaseのPhase 9/10 DB差分は適用済みですが、PR #41はまだDraftで`main`へ未マージです。PWA本番デプロイ、Windows release/updater/latest.json変更、外部決済Webhook、サーバー側AI秘密鍵実行、SNS/記事プラットフォームへの自動投稿も未実施です。

詳細な実装境界は`docs/phase9-11-implementation-batch.md`を参照してください。
