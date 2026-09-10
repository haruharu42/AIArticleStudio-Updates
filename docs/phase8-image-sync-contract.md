# Phase 8 — 画像管理・端末間同期

基準: Phase 7 commit `74f0253`、ローカル origin/main に対して ahead/behind `8 / 0`。
2026-09-07 Astra版ロードマップの Phase 8A を実装。Phase 8B の Windows/iPhone 実機往復確認は別途行う。

## 共有データ

| 対象 | 正本・同期方法 | 競合と保持 |
|---|---|---|
| 完成本文・掲載先・公開状態 | articles / 既存の記事更新RPC | article.revision による比較。未保存内容を上書きしない |
| 元記事・掲載用本文・編集条件・画像計画 | article_workspaces / 既存workspace RPC | 3種類の本文を分離。未知フィールドを保持 |
| 画像ファイル | private article-assets | PNG/JPEG/WebP、10 MiB以下。owner/article/asset の固定パス |
| 画像の順序・alt・挿入マーカー | article_assets / update_article_assets_metadata | 取得時の updated_at をマイクロ秒まで比較し、一括更新を1トランザクションで処理 |
| Windows画像のローカル情報 | image_assets.json の managed_assets | 未知のサイドカーフィールド・ファイル名を保持。未同期の画像情報は metadata_dirty で保持 |
| 端末セッション | Windowsは既存DPAPI、PWAは既存PKCEセッション | 各端末でログイン。セッションを端末間で複製しない |

画像メタ情報の更新では記事本文、workspace、image_plan、記事revisionを変更しない。WindowsとPWAは同じ画像IDを更新し、取得時の updated_at が違えば HTTP 409 / code 40001 で拒否する。複数画像の並べ替え・挿入マーカー交換は全体が成功するか、全体が取り消される。

## 画像操作

- PWA: 記事を開く → 「記事の画像」。表示・追加・差し替え・前後への移動・alt・マーカー・削除に対応。
- Windows: 「画像ファイル」→各画像の「情報」で表示順・alt・マーカーを編集。「最新の画像情報を見る」は入力内容を保持したままクラウド情報を表示。
- 保存済み画像の表示順は Windows 側でも sort_order / created_at / ID で再現。空の画像計画枠は保存済み画像の後へ表示する。
- マーカーは挿入位置の識別子。マーカー変更に伴う本文の自動書き換えは行わない。
- PWAの新規追加は `prepare_article_asset_checked` → upsert:false のアップロード → `transition_article_asset_checked(finalize)`。
- 差し替え前に選択ファイルの形式・サイズ・デコードを検査。既存の削除ライフサイクルを完了してから、新しい画像IDを準備する。旧パスへ上書きしない。Windowsの追加・確定は既存Phase 4 RPCを維持する。
- 差し替えは旧画像の削除を伴う。新画像の送信が中断した場合、PWAは選択したFileを画面内で保持する。ページを閉じた場合は元ファイルを選び直して再送する。ブラウザーへ画像バイナリを永続保存しない。
- PWAは「最新状態を確認」で未保存内容を保持し、比較用の最新一覧を表示。「この最新状態へ切り替える」で明示的に採用する。
- Windowsは通信失敗・競合時も未同期メタ情報をローカルへ保持。画像が他端末で削除された場合も、未同期メタ情報とローカル画像を勝手に消さない。
- Windowsは記事削除前に本文を取得しないrevision照合を実施し、古い記事なら画像操作前に停止。個別画像の削除も取得時の画像更新日時を照合する。

## 中断時の再開

| 状態 | PWAでの操作 | 確認内容 |
|---|---|---|
| pending_upload、送信済みか不明 | 「送信済みか確認」 | Storage上に既にあればfinalize。未送信なら案内を表示 |
| pending_upload、ファイル未送信 | 「同じ画像を再送」 | 準備時のSHA256・サイズ・MIMEと一致するファイルのみ。既存画像へのupsertなし |
| pending_upload、不要 | 「準備を取り消す」 | オブジェクトが存在しない場合のみ取り消し。存在する場合は保存状態を確認後に削除 |
| delete_pending | 「削除を再開」 | オブジェクト削除後にメタ情報削除を確定 |
| メタ情報の競合 | 「最新状態を確認」 | 入力中のalt・マーカー・並び順を保持して比較 |

Windowsは「クラウド同期を再試行」で再開する。古い画像の削除・差し替えが競合した場合は、最新の旧画像を確認してから再開できる。情報編集の競合は「情報」から最新内容を確認し、必要な内容を控えてから変更を破棄・再取得して編集し直す。

## DBと公開境界

差分migration: `20260908232521_phase8_image_metadata_and_checked_lifecycle.sql`。
CLIでmigrationを作成後、Supabaseの正式適用履歴の時刻へファイル名を揃えた。適用先は従来のAASプロジェクト。既存migrationは変更しない。

追加する公開RPCは3つ。すべて認証、activeプロフィール、有効なWindowsまたはPWA利用権、記事所有者を確認する。管理者も他人の記事・画像を更新できない。直接DMLを許可しない既存設計に合わせたSECURITY DEFINERであり、search_pathは空、anonの実行権は取り消し済み。内部検査関数はprivateに置き、クライアントの実行権を取り消す。

PWAの操作時にはPWA商品、WindowsではWindows商品の利用権をクライアントでも照合する。共有DBのサーバー側利用権条件はPhase 7と同じ「WindowsまたはPWA」のまま。

画像表示の署名URLは90秒、表示中は75秒ごとに再取得し、背景タブでは更新を止める。画面に近い画像から取得し、表示エラー時は1回自動再取得する。URLは設定済みSupabase originと画像の完全パスを照合し、state以外の永続領域や記事JSONへ保存しない。Service Workerは外部Supabaseの認証・データ・画像をキャッシュしない。

参考: [private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[アップロード](https://supabase.com/docs/reference/javascript/file-buckets-upload)、[署名URL](https://supabase.com/docs/reference/javascript/file-buckets-createsignedurl)。

## 検証の区分

実装側で実施するもの: PWA型検査・lint・build・Phase 6〜8自動テスト、Windows既存回帰と新規メタ情報同期テスト、ローカルPostgreSQLによるSQL契約検証、Supabase実定義・ACL・未認証拒否・件数確認、適用スクリプトの模擬適用。

Phase 8Bで残るもの: 認証済みの実Storageアップロード・再取得・差し替え・中断復旧、Windows/PWAの双方向保存と本文/編集条件/画像計画/画像メタ情報/公開状態の比較、iPhoneの実表示・操作、異なる所有者拒否、実データの清掃。テスト用の一時記事・利用権を使い、保護対象のローカル4記事を試験用に同期しない。

既知の別項目: Authの漏えいパスワード保護未設定。既存のRPC専用テーブルにポリシーがない診断と、意図した認証済みSECURITY DEFINER RPCの診断を継続記録する。Phase 8でAuth設定を変えない。

## 依存関係の修正（2026-09-10）

Cloudflare開発環境が参照するsharpをnpm overridesで0.35.4へ固定しました。旧0.35.2に該当するGHSA-rgj7-g3m4-5g8cへの対応です。
公式情報: https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c

Supabaseの診断には、明示的な権限検査を持つ認証済みSECURITY DEFINER RPCの警告と、既存の漏えいパスワード保護未設定の警告が残ります。新しい3 RPCも所有者・active・製品利用権を関数内で検証し、匿名実行を禁止しています。
Authの既存設定: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
