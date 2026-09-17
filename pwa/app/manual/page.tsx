import Link from "next/link";

const MANUAL_SECTIONS = [
  {
    id: "start",
    title: "1. まず最初にやること",
    lead: "AASは、記事条件を決める → AIへ渡す → 保存・画像・SNSへ展開する、という流れで使います。",
    points: [
      "ホームで掲載先・記事タイプ・ジャンル・対象読者などを選びます。",
      "「記事を作成する」から、使うAIと利用プランを選びます。",
      "タイトル候補・本文・画像・SNS向けの各プロンプトを必要なタイミングで作成します。",
      "生成した内容は記事ライブラリへ保存し、あとから編集・画像追加・公開管理へ進めます。",
    ],
  },
  {
    id: "article",
    title: "2. 記事を作る",
    lead: "記事作成は初心者でも順番を追えるよう、条件設定から出力まで段階的に進みます。",
    points: [
      "掲載先は note / Tips / Brain / ブログから選べます。",
      "無料・有料、ジャンル、サブジャンル、年齢層、性別、文字数目安などを設定します。",
      "タイトル候補を作り、その中から使うタイトルを選びます。",
      "本文用プロンプトをChatGPT・Claude・Geminiなどへ渡して記事を作成します。",
      "本文をAASへ戻して保存し、必要に応じて書き直し・AI補助を使います。",
    ],
  },
  {
    id: "library",
    title: "3. 記事を保存・管理する",
    lead: "作成した記事は記事ライブラリで管理します。",
    points: [
      "下書き・作成中・完成・公開待ち・公開済みなどの状態を管理できます。",
      "記事本文、掲載先、記事タイプ、公開情報などをあとから変更できます。",
      "Windows版とPWA版は、共通クラウド記事を利用できる構成です。",
      "同じ記事を複数端末で編集する場合は、最新状態を確認してから保存してください。",
    ],
  },
  {
    id: "images",
    title: "4. アイキャッチ・挿絵を準備する",
    lead: "記事内容に合わせた画像計画と画像プロンプトを作成できます。",
    points: [
      "アイキャッチと挿絵の有無・枚数を決めます。",
      "記事内容に合わせて、画像の役割や挿入位置を整理します。",
      "生成した画像は記事に紐づけて保存できます。",
      "画像ファイルは対応形式・サイズ制限の範囲でアップロードしてください。",
    ],
  },
  {
    id: "sns",
    title: "5. SNS投稿へ展開する",
    lead: "記事内容をもとに、SNS向けの投稿案へ変換できます。",
    points: [
      "X、Instagram、Threads、TikTok、Facebook、LinkedIn、Pinterest、YouTube向けの投稿プロンプトを作成できます。",
      "記事の要点を短くまとめ、媒体ごとの構成へ変換します。",
      "SNSアカウント設計では、プロフィール・投稿テーマ・収益導線・改善案まで整理できます。",
      "SNS投稿作成・SNS設計画面から、選択中のSNSを直接開けます。スマホでは対応アプリが利用可能な場合はアプリ起動が優先され、PCではWeb版を開きます。",
      "外部SNSへの自動投稿ではなく、内容を確認してからユーザー自身で投稿する運用を基本とします。",
    ],
  },
  {
    id: "tools",
    title: "6. そのほかの機能",
    lead: "記事作成以外にも、公開管理・分析・副業設計などを利用できます。",
    points: [
      "AI副業プランナー：作業時間や得意分野などから候補を整理します。",
      "公開管理：公開予定日・公開URL・公開状態を管理します。",
      "コンテンツ分析：AAS内の記事ストックや状態を確認します。",
      "機能一覧：利用できる各機能へまとめて移動できます。",
    ],
  },
  {
    id: "navigation",
    title: "7. 下部ナビを自分用に変更する",
    lead: "設定画面から、スマホ下部に表示するショートカットを変更できます。",
    points: [
      "ホームと設定は固定です。",
      "中央3枠まで、記事作成・画像・機能一覧・SNS・副業・SNS設計・公開・分析・使い方から選べます。",
      "選んだ項目は左右へ並べ替えられます。",
      "「下部ナビを常に表示」をOFFにすると、ホームと設定以外ではナビを隠せます。",
      "ナビ設定は現在、この端末のPWA／ブラウザに保存されます。",
    ],
  },
  {
    id: "account",
    title: "8. アカウント・利用権・プラン",
    lead: "利用できる機能はアカウント状態と利用権によって決まります。",
    points: [
      "ログイン後、AAS ID・アカウント状態・PWA利用可否を確認できます。",
      "購入や利用券が有効になったあと、反映されない場合は設定から利用権を再確認してください。",
      "無料体験や利用回数の上限が設定されている機能では、残り回数・利用可否を画面表示に従って確認してください。",
      "決済や利用権に問題がある場合は、Q&Aのトラブル項目も確認してください。",
    ],
  },
  {
    id: "trouble",
    title: "9. 困ったとき",
    lead: "表示やログインで問題が起きた場合は、次の順番で確認してください。",
    points: [
      "通信状態を確認し、画面を再読み込みします。",
      "PWAを完全終了してから、もう一度起動します。",
      "ログアウト・再ログインを試します。",
      "利用権が反映されない場合は設定画面の再確認を実行します。",
      "それでも直らない場合は、発生した画面・操作手順・時刻が分かる情報を添えて問い合わせてください。",
    ],
  },
];

export default function ManualPage() {
  return (
    <div className="help-shell">
      <header className="help-topbar">
        <Link className="beginner-brand" href="/" aria-label="AI Article Studio ホーム"><span aria-hidden="true">✦</span><strong>AI ARTICLE <em>STUDIO</em></strong></Link>
        <div className="help-top-actions"><Link href="/faq">Q&A</Link><Link href="/settings">設定</Link></div>
      </header>

      <main className="help-main">
        <section className="help-hero">
          <p className="eyebrow">MANUAL</p>
          <h1>AI Article Studio 使い方マニュアル</h1>
          <p>「何から始めるか」「次に何を押すか」が分かるよう、基本操作から記事・画像・SNS・設定までまとめています。</p>
          <div className="help-hero-actions"><Link href="/create">記事作成を始める</Link><Link className="secondary" href="/faq">よくある質問を見る</Link></div>
        </section>

        <nav className="help-toc" aria-label="マニュアル目次">
          {MANUAL_SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </nav>

        <div className="help-section-list">
          {MANUAL_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="help-card">
              <h2>{section.title}</h2>
              <p>{section.lead}</p>
              <ol>{section.points.map((point) => <li key={point}>{point}</li>)}</ol>
            </section>
          ))}
        </div>

        <section className="help-next-card">
          <div><p className="eyebrow">NEED HELP?</p><h2>答えが見つからない場合</h2><p>Q&Aには、ログイン・利用権・記事作成・画像・SNS・PWA・決済などのよくある質問をまとめています。</p></div>
          <Link href="/faq">Q&Aへ進む →</Link>
        </section>
      </main>
    </div>
  );
}
