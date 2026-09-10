# AI記事スタジオ PWA — Phase 9–11 implementation batch

Phase 8を安定基準として残したまま、次の実装を開発ブランチへ追加しています。

- Phase 9: PWA招待コードの登録画面と、購入・招待をPWA利用権へ変換するDB/RPC契約。
- Phase 10: active管理者向けの共通管理画面。ユーザー承認/停止/再開、Windows/PWA利用権の付与/取消、販売チャネル・期限、PWA招待コードを管理。
- Phase 11: モバイル新規記事制作。生成方法 → 画像計画 → 本文条件 → タイトル → 本文生成 → プレビュー → 保存の7ステップ。

既存のPhase 6 Auth/PKCE、Phase 7記事ライブラリ、Phase 8画像管理はそのまま維持します。記事作成は既存の`create_article_with_workspace`を使用して、記事・編集条件・画像計画を同じ所有者のWorkspaceへまとめて保存します。

## 開発中の入口

- `/` — 既存PWAホーム/記事ライブラリ/画像管理。ログイン状態に応じて新機能へのクイック導線を表示。
- `/invite` — PWA招待コード登録。既存PWA利用権がなくても、pending/activeの一般ユーザーがコードを登録可能。
- `/admin` — active admin専用の共通ユーザー・利用権・招待管理。
- `/create` — activeかつPWA利用可能なアカウントの記事作成ウィザード。

Phase 11のこの実装では、直接AI APIを呼び出さず「ChatGPTプロンプト書き出し」と手動作成を提供します。APIキー・課金方式・モデルルーティングをクライアントへ埋め込まずに記事制作フロー全体を先に完成させるためです。直接AI生成は後続のAI実行層で追加します。

## Phase 9/10 DB差分

新規migration:

`supabase/migrations/20260910112000_phase9_pwa_invites_admin.sql`

追加対象:

- `pwa_invites`
- `pwa_invite_redemptions`
- `admin_create_pwa_invite`
- `admin_list_pwa_invites`
- `admin_revoke_pwa_invite`
- `redeem_pwa_invite`
- `admin_list_user_entitlements`

テーブルの直接アクセスはpublic/anon/authenticatedからrevokeし、操作は認証済みRPCへ限定します。管理RPCは既存`private.is_active_admin()`を要求します。招待利用は認証済み一般ユーザーのpending/activeのみで、`AAS-PWA-BETA`だけを付与します。

**このmigrationは、この開発ブランチへソースとして追加した段階です。まだ本番Supabaseへ適用しません。** 型検査・lint・build・SQL検証・実アカウントE2E後に適用します。

## 開発と確認

Node.js 22.13.0以上。依存関係とlockfileはPhase 8の固定値を維持します。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm audit
```

本番ビルドは`npm run build`。PWA公開デプロイは別工程です。

公開設定:

- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- 既存の利用規約・プライバシー・AI利用規約URL

秘密鍵・service role・ユーザーJWT・DPAPIセッションを設定やバンドルへ埋め込みません。

## 既存のDB基盤

- Phase 1: `20260826101328_platform_entitlements.sql`
- Phase 3: `20260826105740_article_stock_quota.sql`
- Phase 5A: `20260829121737_article_workspaces.sql`
- Phase 7: `20260905133313_phase7_cloud_article_entitlement_enforcement.sql`
- Phase 7: `20260907233443_phase7_delete_revision_conflict_api.sql`
- Phase 8: `20260908232521_phase8_image_metadata_and_checked_lifecycle.sql`

Phase 8までの既存migrationは従来のAAS Supabaseへ適用済みです。Phase 9/10 migrationだけは、このバッチの検証完了まで適用待ちです。

詳細な実装境界は`docs/phase9-11-implementation-batch.md`を参照してください。
