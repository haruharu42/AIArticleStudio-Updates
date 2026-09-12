# AIArticleStudio-Updates

AI記事スタジオの更新ファイル・バージョン管理用リポジトリ。

## Current product direction

2026-09-12より **PWA First** を正式な製品開発方針とする。

- PWA版: 主製品。新機能、UX、販売準備、公開検証を優先。
- Windows版: 保守モード。既存ユーザー保護、セキュリティ、重大不具合、Updater/互換性を維持。
- 共通基盤: Supabase Auth / profiles / entitlements / RLS / articles / workspaces / private Storageを継続利用。
- Windows版を即時廃止せず、既存のWindows利用権も維持する。

詳細:

- [PWA First Product Strategy](docs/PWA_FIRST_PRODUCT_STRATEGY_2026-09-12.md)
- Tracking issue: #49

現在のPWA UX改善はPR #48を優先トラックとして進める。

## Preview deployment

PWAの実機確認は、GitHub Actionsの **[🚀 Previewへデプロイ](https://github.com/haruharu42/AIArticleStudio-Updates/actions/workflows/pwa-preview-deploy.yml)** から手動実行する。

1. `Run workflow` を開き、確認対象のPRブランチを選ぶ。
2. `expected_sha` に確認対象HEADの40文字コミットSHAを入力する。
3. `confirmation` に `DEPLOY_PREVIEW` と入力する。
4. 実行後、Actions summaryに出るPreview URLでiPhone / Android実機確認を行う。

この操作はPreview専用。workflowはtypecheck / lint / build / regression / dependency audit / Wrangler dry-runを再実行し、`ai-article-studio-pwa-preview` へのPreview version uploadだけを許可する。Productionのworkers.dev routing、custom route、custom domainは変更しない。
