# AI Article Studio — PWA Primary / Windows Freeze Policy

更新日: 2026-09-16

## 方針

AI Article Studioは今後、PWA版を唯一の主製品として開発・販売準備・運用改善する。

旧Windows版は削除せず、復旧・参照用の凍結資産として保管する。新機能開発、通常の不具合修正、販売導線、利用開始導線はPWAを基準にする。

## PWA版

PWA版を以下の正式対象とする。

- 新規登録・ログイン
- PWA利用権
- 無料日次利用枠
- 利用コード登録
- 記事作成・編集・保存
- 記事ライブラリ
- 画像資産管理
- SNS支援
- 管理者ダッシュボード
- セキュリティ監査・運用ログ
- 販売・オンボーディング
- Preview / Production公開

PWAクライアントは `AAS-PWA-BETA` のみを製品アクセス判定に使用する。

## Windows版

Windows版は凍結する。

- `src/ai_article_studio/**`、`release/**`、既存Updater資産は削除しない。
- `latest.json`、公開済みWindows release、SHA256資産はこの方針変更だけでは変更しない。
- 新しいWindows版の販売・配布・機能追加は行わない。
- PWAで追加した機能をWindowsへ移植しない。
- 将来Desktop版が必要になった場合は、PWAを基準に再設計する。

## 既存Windows利用権

この方針変更だけを理由に既存 `AAS-WIN-BETA` entitlementを取り消さない。

既存利用権の失効、Windows productの停止、Windows向けRPCの削除は、影響範囲と既存利用者を確認した別工程として扱う。

## セキュリティ原則

- PWA管理者操作はMFA/AAL2を必須とする。
- クライアントへservice_role/secret keyを配布しない。
- RLS + FORCE RLSを維持する。
- 一般ユーザーは自分のプロフィール、記事、Workspace、画像、利用権だけへアクセスできる。
- private Storageを維持する。
- 管理者画面を隠すだけでなく、DB/RPC側でも権限を検証する。
- 新規publicテーブル・関数はデフォルト非公開を維持する。

## 開発ルール

1. 新機能はPWAのみへ実装する。
2. PWA変更は専用branch + PR + CI / Production Preflightを通す。
3. Previewで確認してからProduction候補にする。
4. Production routing、Stripe LIVE、本番販売開始は明示的な承認なしに変更しない。
5. Windows資産は依存が確認できるまで物理削除しない。
6. PWAコードからWindows製品コード・Windowsローカル実装への新規依存を作らない。

## 公開前完了条件

- PWA主要回帰テストPASS
- 管理画面MFA/AAL2 PASS
- 一般ユーザー間のデータ分離PASS
- 無料枠・利用コード・購入導線PASS
- Preview実機E2E PASS
- 重大な未解決エラーなし
- 法務・販売者情報の本番文言確定
- Production切替とrollback手順の最終レビュー完了
