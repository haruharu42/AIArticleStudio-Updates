import Link from "next/link";

type ActionCard = {
  title: string;
  description: string;
  icon: string;
  href: string;
  badge?: string;
};

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
    title: "副業プロンプトを探す",
    description: "用途別テンプレートを選び、必要な情報だけ入力して完成プロンプトをコピーします。",
    icon: "⌘",
    href: "/prompts",
  },
  {
    title: "ジャンル別に機能を見る",
    description: "副業・SNS・販売・受託・リサーチ・運営など、すべての機能をジャンル別に確認します。",
    icon: "▦",
    href: "/tools",
    badge: "機能一覧",
  },
];

function ActionCardView({ card }: { card: ActionCard }) {
  return (
    <Link className="action-studio-card" href={card.href}>
      <div className="action-studio-card-top">
        <span className="action-studio-card-icon" aria-hidden="true">{card.icon}</span>
        {card.badge ? <small>{card.badge}</small> : null}
      </div>
      <strong>{card.title}</strong>
      <p>{card.description}</p>
      <b>開く →</b>
    </Link>
  );
}

export function ActionStudioHomeHub() {
  return (
    <section className="action-studio-hub" aria-labelledby="action-studio-hub-title">
      <div className="action-studio-hero">
        <div>
          <span className="action-studio-kicker">AI ACTION STUDIO</span>
          <h2 id="action-studio-hub-title">今日は、AIで何を進めますか？</h2>
          <p>
            よく使う作業はホームから直接開始できます。
            副業ジャンルから探したい場合は「ジャンル別に機能を見る」から機能一覧へ進めます。
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
          <span>QUICK ACTIONS</span>
          <h3>よく使う機能</h3>
        </div>
        <p>目的が決まっている場合は、必要な機能を直接開けます。</p>
      </div>
      <div className="action-studio-card-grid">
        {actions.map((card) => <ActionCardView key={card.title} card={card} />)}
      </div>
    </section>
  );
}
