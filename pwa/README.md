# AI記事スタジオ PWA — Phase 8

Windows版と同じ所有者の記事・画像を共有するPWA。Phase 6のAuth/PKCE・製品利用権、Phase 7の記事ライブラリに、Phase 8の画像管理を追加。

- 記事一覧は本文を取得せず、詳細を開いたときに完成本文・元記事・掲載用本文・workspaceを取得。
- 記事保存はrevisionで競合を検出。編集条件・画像計画・未知のworkspaceフィールドを保持。
- 記事の画像で、private画像の表示・追加・差し替え・並べ替え・alt・挿入マーカー・削除・中断再開。
- 各操作で認証ユーザーとPWA利用権を照合。共有DBは所有者・active・WindowsまたはPWAの有効利用権を強制。
- 2026-09-07 Astra版ロードマップに準拠。新規記事制作フローはPhase 11。招待制・管理者PWA拡張は後続フェーズ。

## 開発と確認

Node.js 22.13.0以上。依存関係とlockfileを固定。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm audit
```

本番ビルドは `npm run build`、ローカル配信は `npm run start -- --hostname 127.0.0.1 --port 4173`。
通常のWindows確認では付属パッケージが公開設定を環境変数へ渡し、CSS/JSのHTTP応答も確認する。

公開設定:
- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- 既存の利用規約・プライバシー・AI利用規約URL

秘密鍵・service role・ユーザーJWT・DPAPIセッションを設定やバンドルへ埋め込まない。
Sitesのビルドプラグイン・hosting manifest・Worker構成を維持。公開デプロイは別工程。

## 必要なDB差分

- Phase 7: `20260905133313_phase7_cloud_article_entitlement_enforcement.sql`
- Phase 7: `20260907233443_phase7_delete_revision_conflict_api.sql`
- Phase 8: `20260908232521_phase8_image_metadata_and_checked_lifecycle.sql`

いずれも従来のAAS Supabaseへ正式適用済み。Windows適用パッケージはmigrationをソース管理対象に追加し、SQLを再適用しない。
詳しいフィールド・競合・中断復旧の契約は [画像同期契約](../docs/phase8-image-sync-contract.md) を参照。

Phase 8全体の完了には、認証済み実StorageとWindows/iPhoneでの双方向確認が必要。
