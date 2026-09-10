# AI記事スタジオ PWA — Phase 9–17

Phase 8の認証・記事ライブラリ・画像Storage基盤を維持しながら、PWAを利用開始・管理・記事制作・SNS支援・公開管理・内部分析まで拡張した本番準備中のPWAです。

## 実装済み

- Phase 9: PWA招待コードと利用権登録
- Phase 10: active管理者向けユーザー・利用権・招待管理
- Phase 11: 7ステップ記事制作
- Phase 12: 掲載先・無料/有料・ジャンル別専門プロンプト
- Phase 13: アイキャッチ/挿絵の画像プロンプト計画
- Phase 14: X / Instagram / Threads投稿プロンプト
- Phase 15: AI副業プランナー + SNSアカウント立ち上げ設計
- Phase 16: 公開予定・公開URL・公開日時管理
- Phase 17: AAS内部の記事ストック・掲載先・状態分析
- 掲載本文コピー / Markdown出力

Windows版とPWA版は同じSupabase DB/Storageを使い、RLSと所有者分離を維持します。一般ユーザーはPWA利用権が必要で、active管理者は購入利用権なしでも管理・利用できます。

## 主なルート

- `/` — ログイン / 記事ライブラリ
- `/invite` — PWA招待コード登録
- `/admin` — 管理者ダッシュボード
- `/create` — 記事作成
- `/images` — 記事画像管理
- `/sns` — SNS投稿変換
- `/sns-plan` — SNSアカウント立ち上げ設計
- `/sidejob` — AI副業プランナー
- `/publish` — 公開管理
- `/analytics` — 内部分析
- `/export` — 掲載本文 / Markdown出力
- `/tools` — 機能ハブ
- `/healthz` — 本番死活監視用の非機密HTTP 200 endpoint

## 認証と秘密情報

ブラウザーへ設定できるのはSupabaseの公開URLとpublishable/anon public keyだけです。service role、`sb_secret_*`、DBパスワード、ユーザーJWT、DPAPIセッション、Cloudflare API token、AI API secretはPWAへ埋め込みません。

AuthはSupabase Auth + PKCEを使用します。OAuth・メール確認・パスワード再設定は`/auth/callback`へ戻し、production URLは`window.location.origin`から決定します。

## 開発・CI

Node.js 22.13.0以上。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm audit --audit-level=high
```

GitHub Actionsの`PWA Phase 9-17 CI`で型検査、lint、Vinext build、Phase 6–17回帰、dependency auditに加え、本番公開設定の静的preflightも検証します。

## 本番公開準備

Hosting targetはCloudflare Workersです。PWAには`wrangler.jsonc`、manifest、Service Worker、192/512px icon、offline fallback、production health endpointを用意しています。

本番環境では以下が必須です。

- `AAS_PWA_PRODUCTION_ORIGIN`
- `NEXT_PUBLIC_AAS_SUPABASE_URL`
- `NEXT_PUBLIC_AAS_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_AAS_TERMS_URL`
- `NEXT_PUBLIC_AAS_PRIVACY_URL`
- `NEXT_PUBLIC_AAS_AI_TERMS_URL`

`.env.production.example`を参照し、実値はGitへコミットしません。

本番preflight:

```sh
npm run production:preflight
```

Cloudflareへの手動デプロイは、Cloudflare認証とSupabase Auth Redirect URL設定を完了した後にのみ実行します。

```sh
npm run deploy:cloudflare
```

詳細な公開手順、Supabase Auth URL設定、初回smoke test、rollback手順は`docs/pwa-production-release.md`を参照してください。

## 公開境界

Phase 9–17は2026-09-10にmainへ統合済みです。本番Supabaseの必要migrationも適用済みですが、PWA本番デプロイ自体は別ゲートです。

現段階では、外部決済Webhook、サーバー側AI秘密鍵実行、実画像生成API、note/Tips/Brain自動投稿、X/Instagram/Threads自動投稿、外部売上/トラフィック分析は含みません。
