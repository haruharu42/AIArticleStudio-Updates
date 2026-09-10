# AI記事スタジオ PWA 本番公開準備

基準: `main` の Phase 9–17 統合後。

この文書は **本番デプロイそのものではなく、その直前までの準備・検証ゲート** を定義する。Windows release / updater / `latest.json` は変更しない。

## 推奨ホスティング

現行PWAは `@cloudflare/vite-plugin`、`wrangler`、`workerd` 前提のWorkerエントリを既に持つため、第一候補は Cloudflare Workers とする。

Worker entry は `env.ASSETS` と `env.IMAGES` を直接参照する。Cloudflare構成では `ASSETS` static-assets binding と `IMAGES` Images bindingを明示し、production buildが生成するWrangler設定をCIで検証する。

preview準備中は `workers_dev: false`、`preview_urls: true` を固定する。これにより通常のproduction `workers.dev` routeは作らず、Cloudflareのversioned/aliased Preview URLだけを明示的に使う。production routingはpreview E2E完了後の別ゲートで判断する。

## 本番公開前の公開設定

ブラウザー公開可能な値のみ設定する。

- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AAS_TERMS_URL`
- `NEXT_PUBLIC_AAS_PRIVACY_URL`
- `NEXT_PUBLIC_AAS_AI_TERMS_URL`

法的文書リンクは、同一PWA内の `/terms`、`/privacy`、`/ai-terms` を既定値とする。必要であればHTTPSの外部URLに差し替えられる。

Cloudflare Worker名は `AAS_CLOUDFLARE_WORKER_NAME` で指定できる。preview候補は `ai-article-studio-pwa-preview`。既存Workerがある場合は上書きせず停止して判断する。

禁止:

- Supabase `service_role`
- `sb_secret_*`
- ユーザーJWT / refresh token
- Windows DPAPI session
- OpenAI等の秘密APIキー

## 法的文書の状態

`/terms`、`/privacy`、`/ai-terms` はpreview検証用のドラフトとして実装する。一般販売・正式公開前に、少なくとも運営者情報、問い合わせ窓口、販売条件、解約・返金条件、必要な特定商取引法表示を確定し、ドラフト表示を外す。

previewでのE2Eは可能だが、ドラフト状態のまま一般販売や正式公開を開始しない。

## Gate PWA-PROD-0: source baseline

- `origin/main` を基準にする。
- stable repository が clean。
- Phase 9–17 PWA CI が green。
- `Validate update release` が green。
- 本番Supabase migration適用済み。
- E2E使い捨て記事・招待・利用権・画像資産が残っていない。

## Gate PWA-PROD-1: build/security preflight

`scripts/Prepare-AAS-PWA-Production.ps1` を実行し、以下を満たすこと。

- Node.js >= 22.13.0
- `npm ci --ignore-scripts --no-audit --no-fund`
- typecheck PASS
- lint PASS
- build/regression PASS
- npm audit PASS
- manifest / 192 / 512 icon / service worker存在
- service workerが `/auth/callback`、`/api/`、OAuth code/tokenをキャッシュ対象から除外
- Supabase公開キーが secret/service-role ではない
- 法的文書リンクが既知のfirst-party routeまたはHTTPS外部URL
- レポートに秘密値を出力しない
- `PWA Production Preflight` CIで生成Wrangler configを検出
- `ASSETS` / `IMAGES` bindingを検出
- `workers_dev: false` / `preview_urls: true` を検出
- generated config内にsecret/service-role markerがない
- `wrangler deploy --dry-run` PASS
- Windows PowerShell 5.1でpreflight helper本体を実行してPASS

`wrangler deploy --dry-run` はbundle/設定検証のみで、Cloudflareへ公開しない。

2026-09-11 JST時点で、Windows実機でも実Supabase公開設定を使ったproduction build、64件の回帰テスト、generated Wrangler config、`ASSETS` / `IMAGES` binding、secret marker scan、`wrangler deploy --dry-run` がPASSしている。Cloudflareへのupload/deployはこの確認では行っていない。

## Gate PWA-PROD-2: Cloudflare preview setup

Cloudflare Workersを採用する場合:

1. Cloudflare OAuthログインを確認する。
2. preview Worker名が未使用であることをread-onlyで確認する。
3. 実Supabase公開設定でproduction build + Wrangler dry-runを実機確認する。
4. `workers_dev: false` / `preview_urls: true` を維持する。
5. 明示承認後に `wrangler versions upload --preview-alias aas-preview` でpreview versionだけをuploadする。
6. 通常のproduction deploymentは行わない。
7. Preview URLを販売ページへ掲載しない。

2026-09-11 JST時点で、Cloudflare OAuth認証はPASSし、`ai-article-studio-pwa-preview` はread-only確認で未使用と判定済み。Workerはまだ作成・更新・upload・deployしていない。

専用スクリプト `scripts/Publish-AAS-PWA-Preview-Version.ps1` は `-ConfirmPreviewUpload` がない限りCloudflareへ何もuploadしない。実行時も `wrangler deploy` ではなく `wrangler versions upload` を使用し、production trafficへ昇格させない。

Preview URLは外部から到達可能な公開URLになるため、秘密情報を埋め込まず、必要に応じてCloudflare Access等で保護する。

## Gate PWA-PROD-3: Preview URL / Supabase Auth

Preview URL確定後にSupabase Auth設定を確認する。

- preview中はOAuth redirect allow-listへ `<preview-origin>/auth/callback` を追加。
- Email confirmation / password recoveryのredirectもpreview originで確認する。
- Google OAuthを使用する場合、Google側Authorized redirect URIも整合させる。
- Site URLを最終本番PWA URLへ設定するのはproduction URL確定時。
- localhost / LANテストURLを不用意に削除しない。削除は別途判断する。

## Gate PWA-PROD-4: preview E2E

外部到達可能なPreview URLで最低限以下を確認する。

- `/terms`, `/privacy`, `/ai-terms` 表示
- 未ログイン画面
- Email/Password login
- Google OAuth / PKCE
- AAS-000001 admin access
- 一般ユーザーのPWA entitlement gate
- invite redeem
- article create/read/update/delete
- Windows ↔ PWA同期
- private image signed URL / upload / replace / delete
- `/admin`, `/create`, `/images`, `/sns`, `/sidejob`, `/sns-plan`, `/publish`, `/analytics`, `/export`
- iPhone SafariでPWAインストール
- service worker更新とoffline fallback

テストデータは完了後にexact-IDで清掃する。

## Gate PWA-PROD-5: production release decision

以下が揃って初めて正式公開可とする。

- preview E2E PASS
- Supabase Auth redirect PASS
- 法的文書の正式版確定・ドラフト表示削除
- 販売条件・特定商取引法表示の確定
- 本番URL HTTPS PASS
- manifest/install PASS
- secrets scan PASS
- admin/user isolation PASS
- cleanup PASS
- rollback手順確認

その後にのみ、production deployment / custom domain / 販売導線公開へ進む。

## ロールバック方針

PWA公開に問題が出た場合は、DBを巻き戻すのではなく、まず直前の正常Worker versionへ戻す。既存のPhase 9–17 DB migrationは履歴として保持し、既存migration編集やRLS無効化は行わない。
