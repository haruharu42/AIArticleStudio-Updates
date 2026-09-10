# AI記事スタジオ PWA 本番公開準備

基準: `main` の Phase 9–17 統合後。

この文書は **本番デプロイそのものではなく、その直前までの準備・検証ゲート** を定義する。Windows release / updater / `latest.json` は変更しない。

## 推奨ホスティング

現行PWAは `@cloudflare/vite-plugin`、`wrangler`、`workerd` 前提のWorkerエントリを既に持つため、第一候補は Cloudflare Workers とする。

Worker entry は `env.ASSETS` と `env.IMAGES` を直接参照する。Cloudflareの本番構成では `ASSETS` static-assets binding と `IMAGES` Images bindingを明示し、production buildが生成するWrangler設定をCIで検証する。

ただし、Cloudflareアカウント、Worker名、`workers.dev` / カスタムドメイン、DNS/TLSの確定までは公開を実行しない。

## 本番公開前の必須値

ブラウザー公開可能な値のみ設定する。

- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AAS_TERMS_URL`
- `NEXT_PUBLIC_AAS_PRIVACY_URL`
- `NEXT_PUBLIC_AAS_AI_TERMS_URL`

Cloudflare Worker名は `AAS_CLOUDFLARE_WORKER_NAME` で指定できる。未指定時はpreview用の既定名を使い、意図せず既存本番Workerを上書きしない。

禁止:

- Supabase `service_role`
- `sb_secret_*`
- ユーザーJWT / refresh token
- Windows DPAPI session
- OpenAI等の秘密APIキー

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
- 利用規約・プライバシー・AI利用規約URLがHTTPS
- レポートに秘密値を出力しない
- `PWA Production Preflight` CIで生成Wrangler configを検出
- `ASSETS` / `IMAGES` bindingを検出
- generated config内にsecret/service-role markerがない
- `wrangler deploy --dry-run` PASS
- Windows PowerShell 5.1でpreflight helper本体をpublic-only fixtureに対して実行してPASS

`wrangler deploy --dry-run` はbundle/設定検証のみで、Cloudflareへ公開しない。

## Gate PWA-PROD-2: hosting setup

Cloudflare Workersを採用する場合:

1. CloudflareアカウントとWorker名を確定。
2. Cloudflareへログインし、対象アカウントを確認。
3. Build時の公開環境変数5件をCloudflare側へ設定。
4. `workers.dev` のpreview Workerへ初回deploy。
5. まだ一般公開URLを販売ページへ掲載しない。

実際の `wrangler deploy` は明示承認後にのみ実行する。

### Cloudflare接続確認だけを行う安全なコマンド

次のコマンドは認証状態と対象アカウントを確認するだけで、Workerの作成・更新・デプロイは行わない。

```powershell
Set-Location .\pwa
npx wrangler whoami
```

ログインしていない場合は `npx wrangler login` を実行し、ブラウザーでCloudflare認証を完了してから `npx wrangler whoami` を再実行する。ログイン操作だけではAAS Workerのdeployは行わない。

## Gate PWA-PROD-3: production URL / Supabase Auth

本番またはpreview URL確定後にSupabase Auth設定を確認する。

- Site URLを最終本番PWA URLへ設定するのは本番URL確定時。
- preview中はOAuth redirect allow-listへ `<preview-origin>/auth/callback` を追加。
- 本番URL確定後は `<production-origin>/auth/callback` も追加。
- Google OAuthを使用する場合、Google側Authorized redirect URIも整合させる。
- localhost / LANテストURLを不用意に削除しない。削除は別途判断する。

## Gate PWA-PROD-4: preview E2E

外部到達可能なpreview URLで最低限以下を確認する。

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

## Gate PWA-PROD-5: release decision

以下が揃って初めて本番公開可とする。

- preview E2E PASS
- Supabase Auth redirect PASS
- 本番URL HTTPS PASS
- manifest/install PASS
- secrets scan PASS
- admin/user isolation PASS
- cleanup PASS
- rollback手順確認

その後にのみ、production deploy / custom domain / 販売導線公開へ進む。

## ロールバック方針

PWA公開に問題が出た場合は、DBを巻き戻すのではなく、まず直前の正常Worker versionへ戻す。既存のPhase 9–17 DB migrationは履歴として保持し、既存migration編集やRLS無効化は行わない。
