import Link from "next/link";

type ActionCard = {
  title: string;
  description: string;
  icon: string;
  href?: string;
  badge?: string;
};

const sideHustles: readonly ActionCard[] = [
  {
    title: "note副業",
    description: "アカウント準備から投稿計画、記事作成、運営まで順番に進めます。",
    icon: "▣",
    href: "/note-operations",
    badge: "利用可能",
  },
  {
    title: "記事・コンテンツ販売",
    description: "note・Tips・Brain・ブログ向けの記事を、条件選択からAI連携まで進めます。",
    icon: "✎",
    href: "/create",
    badge: "利用可能",
  },
  {
    title: "SNS運用・集客",
    description: "発信ジャンル、プロフィール、投稿の柱、収益導線まで設計します。",
    icon: "↗",
    href: "/sns-plan",
    badge: "利用可能",
  },
  {
    title: "自分に合うAI副業を探す",
    description: "使える時間・得意分野・予算から候補を整理し、30日プランへつなげます。",
    icon: "◇",
    href: "/sidejob",
    badge: "利用可能",
  },
  {
    title: "YouTube・動画副業",
    description: "企画、台本、タイトル、概要欄、ショート動画向けの支援を順次追加します。",
    icon: "▶",
    badge: "準備中",
  },
  {
    title: "物販・アフィリエイト",
    description: "商品調査、販売文、比較、集客までを迷わず進められる専用フローを順次追加します。",
    icon: "¥",
    badge: "準備中",
  },
];

const actions: readonly ActionCard[] = [
  {
    title: "記事を作る",
    description: "掲載先・ジャンル・読者・文字数などを選んで記事作成を開始します。",
    icon: "✎",
    href: "/create",
  },
  {
    title: "SNS投稿を作る",
    description: "保存した記事からX・Instagram・Threads向け投稿を作ります。",
    icon: "↗",
    href: "/sns",
  },
  {
    title: "画像を作る",
    description: "アイキャッチ・挿絵の画像生成プロンプトと保存情報を準備します。",
    icon: "▧",
    href: "/images",
  },
  {
    title: "アカウントを設計する",
    description: "発信名、プロフィール、発信軸、初期投稿まで媒体別に整えます。",
    icon: "◫",
    href: "/account-design",
  },
  {
    title: "今日の作業を整理する",
    description: "作成・公開・SNS再利用など、今日進める作業をひとつの流れで確認します。",
    icon: "◎",
    href: "/workflow",
  },
  {
    title: "すべての機能を見る",
    description: "記事生成に重複しない関連機能を、用途別にまとめて確認します。",
    icon: "▦",
    href: "/tools",
  },
];

function ActionCardView({ card }: { card: ActionCard }) {
  const content = (
    <>
      <div className="action-studio-card-top">
        <span className="action-studio-card-icon" aria-hidden="true">{card.icon}</span>
        {card.badge ? <small>{card.badge}</small> : null}
      </div>
      <strong>{card.title}</strong>
      <p>{card.description}</p>
      <b>{card.href ? "開く →" : "順次対応予定"}</b>
    </>
  );

  if (!card.href) {
    return <article className="action-studio-card planned" aria-disabled="true">{content}</article>;
  }

  return <Link className="action-studio-card" href={card.href}>{content}</Link>;
}

export function ActionStudioHomeHub() {
  return (
    <section className="action-studio-hub" aria-labelledby="action-studio-hub-title">
      <div className="action-studio-hero">
        <div>
          <span className="action-studio-kicker">AI ACTION STUDIO</span>
          <h2 id="action-studio-hub-title">今日は、AIで何を進めますか？</h2>
          <p>
            副業や目的を選ぶだけで、必要な機能へすぐ進めます。
            AIに何を聞けばいいか分からなくても、AASが作業の入口を整理します。
          </p>
        </div>
        <div className="action-studio-flow" aria-label="基本の使い方">
          <span><b>1</b> 選ぶ</span>
          <i aria-hidden="true">→</i>
          <span><b>2</b> 入力</span>
          <i aria-hidden="true">→</i>
          <span><b>3</b> AIで実行</span>
        </div>
      </div>

      <div className="action-studio-section-head">
        <div>
          <span>START BY SIDE HUSTLE</span>
          <h3>副業から探す</h3>
        </div>
        <p>やりたい副業を選び、必要な作業へ順番に進みます。</p>
      </div>
      <div className="action-studio-card-grid side-hustles">
        {sideHustles.map((card) => <ActionCardView key={card.title} card={card} />)}
      </div>

      <div className="action-studio-section-head">
        <div>
          <span>START BY ACTION</span>
          <h3>やりたいことから探す</h3>
        </div>
        <p>目的が決まっている場合は、必要な機能を直接開けます。</p>
      </div>
      <div className="action-studio-card-grid">
        {actions.map((card) => <ActionCardView key={card.title} card={card} />)}
      </div>
    </section>
  );
}
