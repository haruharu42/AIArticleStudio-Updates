import Link from "next/link";

const MANUAL_SECTIONS = [
  {
    id: "home",
    group: "基本",
    title: "ホーム",
    when: "まず今日やることを確認したい時、記事作成や最近の記事へすぐ移動したい時。",
    lead: "AASの入口です。記事条件の簡易設定、最近の記事、note運営の今日の予定などをまとめて確認します。",
    points: [
      "記事を作る場合は、掲載先・無料/有料・ジャンルなどを選んで記事作成へ進みます。",
      "最近の記事から、途中の記事や完成済みの記事へ戻れます。",
      "note運営を使っている場合は、その日の予定をホームから確認できます。",
    ],
    links: [{ href: "/", label: "ホームを開く" }],
  },
  {
    id: "create",
    group: "記事制作",
    title: "記事を作る",
    when: "note / Tips / Brain / ブログ向けの記事を新しく作りたい時。",
    lead: "条件設定からAI選択、タイトル、本文、画像計画、保存まで順番に進めます。",
    points: [
      "掲載先、無料/有料、ジャンル、読者、文字数などを設定します。",
      "使用AIと利用プランを選びます。AASは選択内容に合わせてプロンプトを調整します。",
      "タイトル候補を作り、使うタイトルを決めて本文作成へ進みます。",
      "AI回答をAASへ戻し、記事ライブラリへ保存します。",
      "実体験・実績・資格などは、ユーザーが入力した事実だけを使います。",
    ],
    links: [{ href: "/create", label: "記事作成を開く" }],
  },
  {
    id: "presets",
    group: "記事制作",
    title: "記事プリセット",
    when: "同じnoteジャンルや同じ読者向けの記事を繰り返し作る時。",
    lead: "よく使う記事条件を保存して、毎回の入力を減らします。",
    points: [
      "ジャンル、読者、文章の傾向など、繰り返し使う条件をプリセット化します。",
      "次回の記事作成でプリセットを選び、必要な部分だけ変更します。",
      "蓄積した利用傾向は個人最適化に使いますが、記事本文全文をプロフィールへ複製保存する仕組みではありません。",
    ],
    links: [{ href: "/create", label: "記事作成・プリセットへ" }],
  },
  {
    id: "library",
    group: "記事管理",
    title: "記事ライブラリ",
    when: "作成途中の記事へ戻る時、完成記事を探す時、公開状態を整理したい時。",
    lead: "AASで作成・保存した記事をまとめて管理します。",
    points: [
      "下書き・作成中・完成・公開待ち・公開済みなどの状態を確認します。",
      "記事本文、掲載先、無料/有料、公開情報などをあとから編集できます。",
      "Windows版とPWA版で共通クラウド記事を利用する構成です。",
      "複数端末で編集する場合は、最新内容を確認してから保存してください。",
    ],
    links: [{ href: "/?section=library", label: "記事ライブラリを開く" }],
  },
  {
    id: "note-profile",
    group: "note運営",
    title: "note運営アシスタント：プロフィール設計",
    when: "noteをこれから始める時、発信ジャンルや読者像を整理したい時。",
    lead: "初心者向けに、プルダウン中心でnoteアカウントの方向性を整理します。",
    points: [
      "ジャンル、アカウントの方向性、読者、文章の雰囲気、収益化方針を選びます。",
      "必要な人だけ自由入力で経験・資格・テーマなどを追加します。",
      "ChatGPT / Gemini / Claudeへ最新情報の調査プロンプトを渡して、アカウント構成候補を作れます。",
      "noteのパスワード、Cookie、認証コード、アクセストークンはAASへ保存しません。",
    ],
    links: [{ href: "/note-operations", label: "note運営を開く" }],
  },
  {
    id: "note-schedule",
    group: "note運営",
    title: "note運営アシスタント：AIスケジュール",
    when: "「週何回投稿するか」「無料/有料を何本にするか」を自分で決めたくない時、月途中で予定を組み直したい時。",
    lead: "AIに最新情報を調査させ、対象月の投稿頻度・無料/有料比率・曜日・時間帯・テーマを決めてもらいます。",
    points: [
      "対象月と使うAIを選び、「リサーチする」を押します。",
      "AASがプロンプトをコピーしてAIを開きます。AIで回答を生成してください。",
      "JSONを作ったり編集したりする必要はありません。AIの回答全文をそのままコピーします。",
      "AIがカレンダーへ作る予定は「無料note作成」「有料note作成」の2種類だけです。振り返り・SNS告知・初期設定は入れません。",
      "AASへ戻り「コピーしたAI回答を読み込んで反映」を押すだけで、回答末尾の予定表や本文中の日付＋無料note/有料note予定を自動抽出・検証・反映します。",
      "クリップボード読取が使えない端末では、回答全文を貼り付けて「そのまま反映」を押します。",
      "今月を途中で再計画する場合、過去・完了・スキップ履歴を残し、今日以降の未実行予定だけを組み直します。",
      "実際にAASで作成した無料/有料note本数も次回計画の参考にできます。予定より多くても少なくても問題ありません。",
    ],
    links: [{ href: "/note-operations", label: "noteスケジュールを開く" }],
  },
  {
    id: "images",
    group: "画像",
    title: "画像生成計画",
    when: "記事のアイキャッチや挿絵を、記事内容に合わせて準備したい時。",
    lead: "記事条件や本文をもとに、アイキャッチ・挿絵の役割と生成プロンプトを整理します。",
    points: [
      "アイキャッチの有無、挿絵の有無・枚数を決めます。",
      "記事全体から挿絵の候補位置と役割を整理します。",
      "画像生成AIへ渡すための統一プロンプトを作ります。",
      "作成した画像は対応する記事へ紐づけて管理できます。",
    ],
    links: [{ href: "/images", label: "画像生成計画を開く" }],
  },
  {
    id: "sns",
    group: "SNS",
    title: "SNS投稿を作る",
    when: "完成した記事をX・Instagram・Threadsなどで告知したい時。",
    lead: "記事内容をもとに、SNSごとの投稿用プロンプトを作ります。",
    points: [
      "記事ライブラリから告知したい記事を選びます。",
      "X、Instagram、Threads、TikTok、Facebook、LinkedIn、Pinterest、YouTubeから使うSNSを選び、媒体に合わせた投稿案を作ります。",
      "内容を確認してから各SNSへ投稿します。基本運用は自動投稿ではありません。",
      "スマホでは利用可能なSNSアプリ、PCではWeb版を開けます。",
    ],
    links: [{ href: "/sns", label: "SNS投稿作成を開く" }],
  },
  {
    id: "sns-plan",
    group: "SNS",
    title: "SNSアカウント設計",
    when: "SNSの発信テーマ、プロフィール、投稿の柱、収益導線をまとめて設計したい時。",
    lead: "単発投稿ではなく、SNSアカウント全体の運営方針を整理します。",
    points: [
      "運営ジャンルと届けたい相手を整理します。",
      "プロフィール、投稿テーマ、投稿の柱を作ります。",
      "収益導線や記事への誘導方法も一緒に整理します。",
      "定期的に見直し、実際の反応に合わせて調整します。",
    ],
    links: [{ href: "/sns-plan", label: "SNS設計を開く" }],
  },
  {
    id: "sidejob",
    group: "企画",
    title: "AI副業プランナー",
    when: "AIを使った副業候補を整理したい時、30日程度の行動案を作りたい時。",
    lead: "作業時間・得意分野・予算などから、候補を整理するためのプロンプトを作ります。",
    points: [
      "使える時間、得意分野、予算などを入力します。",
      "AIへ渡す副業プラン用プロンプトを作ります。",
      "AIが出した案は成果保証ではなく、検討候補として扱います。",
      "実行前に費用・規約・必要スキルなどを自分で確認してください。",
    ],
    links: [{ href: "/sidejob", label: "AI副業プランナーを開く" }],
  },
  {
    id: "export",
    group: "公開",
    title: "記事を出力",
    when: "完成記事をnote等へ貼り付けたい時、Markdownとして端末へ保存したい時。",
    lead: "AAS内の記事を掲載用の本文として取り出します。",
    points: [
      "出力したい記事を選びます。",
      "掲載用本文をコピーするか、Markdownファイルとして保存します。",
      "公開前に見出し、リンク、画像位置などを掲載先で最終確認してください。",
    ],
    links: [{ href: "/export", label: "記事出力を開く" }],
  },
  {
    id: "publish",
    group: "公開",
    title: "公開管理",
    when: "いつ公開するか、どの記事を公開済みにしたか、公開URLを管理したい時。",
    lead: "記事ごとの公開予定・公開日時・公開URLを記録します。",
    points: [
      "公開予定日を設定して、公開待ちの記事を整理します。",
      "実際に公開したら公開日時とURLを記録します。",
      "AASの公開管理は記録・管理用です。外部サービスへの自動公開とは別機能です。",
    ],
    links: [{ href: "/publish", label: "公開管理を開く" }],
  },
  {
    id: "analytics",
    group: "分析",
    title: "コンテンツ分析",
    when: "記事ストックの偏りや、最近どの掲載先・状態の記事が多いか確認したい時。",
    lead: "AASに保存されている記事データを集計して確認します。",
    points: [
      "記事数、掲載先、状態などをAAS内データから集計します。",
      "最近更新した記事を確認して、作業再開の判断材料にします。",
      "外部サービスのPV・売上を自動取得する分析とは別です。",
    ],
    links: [{ href: "/analytics", label: "コンテンツ分析を開く" }],
  },
  {
    id: "creator",
    group: "活動",
    title: "ランキング・プロフィール・ミッション",
    when: "AAS内の活動状況、プロフィール、XPやミッションを確認したい時。",
    lead: "AAS内での活動を見える化する機能です。",
    points: [
      "プロフィールで表示名やプロフィール画像などを確認・設定します。",
      "ミッションでは、AAS内で取り組める課題とXPを確認します。",
      "ランキング公開設定を使う場合は、プロフィール側の公開設定を確認してください。",
    ],
    links: [
      { href: "/profile", label: "プロフィールを開く" },
      { href: "/ranking", label: "ランキングを開く" },
      { href: "/missions", label: "ミッションを開く" },
    ],
  },
  {
    id: "settings",
    group: "設定",
    title: "AI設定・個人最適化・下部ナビ",
    when: "よく使うAI、文章の好み、スマホのショートカットを自分向けに整えたい時。",
    lead: "AASの使い勝手を自分向けに調整します。",
    points: [
      "よく使うAIと利用プランを設定します。",
      "個人最適化では、文章の好みや小さな利用傾向を次回プロンプトへ反映できます。",
      "ホームと設定は固定し、スマホ下部ナビの中央3枠を好きな機能へ変更できます。",
      "ナビの並び順や表示設定は端末ごとに保存される項目があります。",
      "アカウントを切り替える場合は設定のログアウトを使用します。",
    ],
    links: [{ href: "/settings", label: "設定を開く" }],
  },
  {
    id: "account",
    group: "アカウント",
    title: "利用権・招待・無料体験",
    when: "購入後に機能が使えない時、招待コードを登録する時、残り利用回数を確認したい時。",
    lead: "アカウント状態とAASの利用権を確認します。",
    points: [
      "購入・招待後に反映されない場合は、設定から利用権を再確認します。",
      "招待コードが必要な場合は、招待画面から登録します。",
      "無料体験や無料枠では、画面に表示される利用可能回数を確認してください。",
      "パスワードや決済用の秘密情報を問い合わせへ送らないでください。",
    ],
    links: [
      { href: "/invite", label: "招待コードを登録" },
      { href: "/settings", label: "利用権を確認" },
    ],
  },
  {
    id: "updates",
    group: "管理者専用",
    title: "アップデート管理",
    when: "新機能を一般ユーザーへ出す前に、管理者→指定テスター→全体公開の順で確認したい時。",
    lead: "候補版を段階的に確認してから一般ユーザーへ公開するための管理機能です。",
    points: [
      "第1段階で管理者アカウントだけが候補版を確認します。",
      "問題がなければ第2段階へ進め、指定した一般ユーザーテスターだけで確認します。",
      "第2段階を通過した候補だけ、第3段階の全一般ユーザー公開承認へ進めます。",
      "一般ユーザーテスターはadminへ昇格させず、role=userのまま実利用に近い状態で確認します。",
      "候補版の確認が終わる前に一般公開しないことを基本運用にします。",
    ],
    links: [{ href: "/admin/releases", label: "アップデート管理を開く" }],
  },
  {
    id: "admin-users",
    group: "管理者専用",
    title: "ユーザー管理",
    when: "新規ユーザーを承認する時、利用停止・再開などを管理する時。",
    lead: "一般ユーザーの承認状態と利用状態を管理します。",
    points: [
      "承認待ちユーザーを確認し、問題なければactiveへ承認します。",
      "必要に応じて一時停止・再開を行います。",
      "管理操作はUIだけでなく、DB側のactive admin判定を通して実行します。",
      "管理者自身の保護や既存の認可を弱める操作は行わないでください。",
    ],
    links: [{ href: "/admin/users", label: "ユーザー管理を開く" }],
  },
  {
    id: "admin-ops",
    group: "管理者専用",
    title: "ナレッジ・Security & Operations・販促",
    when: "AAS全体の運用状況、ナレッジ更新、エラー、販売・SNS告知素材を管理したい時。",
    lead: "一般ユーザー向け機能とは分離された管理者用の運用機能です。",
    points: [
      "ナレッジ管理では、候補や更新内容を確認して正式Knowledgeへ反映します。",
      "Security & Operationsでは、未解決イベントや運用上の異常を確認します。",
      "販売・宣伝では、確認済みの製品情報を基準に記事やSNS素材を準備します。",
      "秘密鍵、service_role、アクセストークンなどをクライアントやログへ追加しないでください。",
    ],
    links: [
      { href: "/admin/knowledge", label: "ナレッジ管理" },
      { href: "/admin/operations", label: "Security & Operations" },
      { href: "/admin/promotion", label: "販促管理" },
    ],
  },
  {
    id: "trouble",
    group: "困った時",
    title: "トラブル時の確認",
    when: "ログインできない、表示が古い、利用権が反映されない、操作が完了しない時。",
    lead: "まず端末側で安全に確認できる順番をまとめています。",
    points: [
      "通信状態を確認し、画面を再読み込みします。",
      "PWAを完全終了してから、もう一度起動します。",
      "必要に応じてログアウト・再ログインを試します。",
      "利用権が反映されない場合は、設定から利用権を再確認します。",
      "不具合報告では、発生画面・直前の操作・発生時刻・再現可否を伝えてください。",
      "パスワード、秘密鍵、Cookie、認証コード、アクセストークンは送らないでください。",
    ],
    links: [{ href: "/faq", label: "Q&Aを見る" }],
  },
] as const;

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
          <h1>AI Article Studio 機能別マニュアル</h1>
          <p>「この機能は何をするのか」「どんな時に使うのか」「何を押せばよいか」を、一般機能と管理者機能に分けてまとめています。</p>
          <div className="help-hero-actions"><Link href="/tools">機能一覧を開く</Link><Link className="secondary" href="/faq">よくある質問を見る</Link></div>
        </section>

        <section className="help-quick-guide" aria-labelledby="help-quick-guide-title">
          <div><p className="eyebrow">QUICK GUIDE</p><h2 id="help-quick-guide-title">目的から機能を選ぶ</h2></div>
          <div className="help-quick-grid">
            {MANUAL_SECTIONS.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                <span>{section.group}</span>
                <strong>{section.title}</strong>
                <small>{section.when}</small>
              </a>
            ))}
          </div>
        </section>

        <nav className="help-toc" aria-label="マニュアル目次">
          {MANUAL_SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
        </nav>

        <div className="help-section-list">
          {MANUAL_SECTIONS.map((section) => (
            <section key={section.id} id={section.id} className="help-card">
              <div className="help-card-heading">
                <span>{section.group}</span>
                <h2>{section.title}</h2>
              </div>
              <div className="help-when"><strong>こういう時に使います</strong><p>{section.when}</p></div>
              <p className="help-card-lead">{section.lead}</p>
              <ol>{section.points.map((point) => <li key={point}>{point}</li>)}</ol>
              <div className="help-card-links">
                {section.links.map((link) => <Link key={link.href + link.label} href={link.href}>{link.label} →</Link>)}
              </div>
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
