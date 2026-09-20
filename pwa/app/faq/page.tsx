import Link from "next/link";

const FAQ_GROUPS = [
  {
    title: "はじめ方・基本操作",
    items: [
      ["最初にどこから始めればいいですか？", "ホームの「記事を作成する」から始めるのが基本です。掲載先やジャンルなどを先に選んでから記事作成へ進むと、条件を引き継げます。"],
      ["AASだけでAI回答まで自動生成されますか？", "AASは記事条件や専用プロンプトを整理し、ChatGPT・Claude・Geminiなどへ渡しやすくする構成です。利用するAIやプランは記事作成時に選べます。"],
      ["作成した記事はどこに保存されますか？", "記事は記事ライブラリで管理します。クラウド記事として保存された内容は、利用権のある対応端末から確認・編集できる構成です。"],
    ],
  },
  {
    title: "記事・画像・SNS",
    items: [
      ["note、Tips、Brain向けに内容を変えられますか？", "はい。掲載先、無料・有料、ジャンル、対象読者などの条件をプロンプトへ反映する設計です。"],
      ["note、Tips、Brainのアカウント設計を別々に保存できますか？", "はい。アカウント設計画面でnote・Tips・Brainを切り替え、媒体ごとに別々の設計を保存できます。基本項目はプルダウン式で、「その他」を選んだ項目だけ自由入力欄が表示されます。"],
      ["アイキャッチや挿絵も管理できますか？", "はい。記事ごとに画像計画を作成し、対応する画像を記事へ紐づけて管理できます。"],
      ["SNS投稿文も作れますか？", "はい。X、Instagram、Threads、TikTok、Facebook、LinkedIn、Pinterest、YouTube向けの投稿プロンプトを作成できます。記事からSNS向けに展開する使い方もできます。"],
      ["選択したSNSをすぐ開けますか？", "はい。SNS投稿作成・SNS設計画面から選択中のSNSを開けます。スマホでは対応アプリが利用可能な場合はアプリ起動が優先され、開けない場合はWeb版へ進みます。PCではWeb版を開きます。"],
      ["noteやSNSへ自動投稿されますか？", "現在の基本運用は自動投稿ではありません。内容を確認したうえで、ユーザー自身が各サービスへ投稿・公開します。"],
    ],
  },
  {
    title: "PWA・ナビ・表示",
    items: [
      ["下部ナビの項目は変更できますか？", "スマホ下部ナビは画面ごとの違いをなくすため、「ホーム / 作成 / ライブラリ / ランキング / プロフィール」の5項目に統一しています。項目の並べ替えは行いません。"],
      ["下部ナビを消すことはできますか？", "設定の「下部ナビを常に表示」をOFFにすると、設定以外の補助画面では下部ナビを隠せます。ホーム・作成・ランキング・プロフィールなど主要画面は各画面の共通ナビを使います。"],
      ["ナビ設定は別の端末にも同期されますか？", "「下部ナビを常に表示」の設定は、その端末のPWA／ブラウザに保存されます。別端末ではそれぞれ設定してください。"],
      ["画面が古い表示のままに見えます。", "PWAを完全終了して再起動し、必要に応じて画面を再読み込みしてください。更新直後は端末側に古い画面資産が残る場合があります。"],
    ],
  },
  {
    title: "アカウント・利用権・決済",
    items: [
      ["購入したのに利用できません。", "まず設定画面から利用権の再確認を実行してください。改善しない場合は、ログアウト・再ログイン、PWA再起動の順で確認してください。"],
      ["無料体験中にすべて無制限で使えますか？", "無料体験では機能ごとに利用回数などの制限が設定される場合があります。画面に表示される利用可否・残り回数を確認してください。"],
      ["管理者も利用券の購入が必要ですか？", "有効な管理者アカウントは、管理用の権限設計により一般ユーザーとは異なる扱いになります。表示される管理画面と利用可否を基準にしてください。"],
      ["支払い後、反映までどのくらいかかりますか？", "通常は決済完了後の処理で利用権が更新されます。反映されない場合は利用権の再確認を行い、それでも改善しない場合は問い合わせてください。"],
    ],
  },
  {
    title: "トラブル・安全性",
    items: [
      ["ログイン状態を確認できないと表示されます。", "通信状態を確認し、PWA再起動・再ログインを試してください。繰り返す場合は、表示された画面と発生時刻が分かる情報を添えて問い合わせてください。"],
      ["記事や画像が別ユーザーに見えることはありませんか？", "記事・画像はユーザーごとに分離する前提で、認証・RLS・所有者確認を通してアクセスする設計です。"],
      ["記事本文やAIプロンプトは個人最適化のために複製保存されますか？", "個人最適化では、本文全文やAI回答全文・プロンプト全文を個人プロフィールへ複製保存せず、設定値や小さな利用傾向だけを扱う設計です。"],
      ["不具合を報告するときは何を伝えればいいですか？", "発生した画面、直前に行った操作、発生時刻、再現できるかどうかを伝えると確認しやすくなります。パスワード、秘密鍵、決済用の秘密情報は送らないでください。"],
    ],
  },
] as const;

export default function FaqPage() {
  return (
    <div className="help-shell">
      <header className="help-topbar">
        <Link className="beginner-brand" href="/" aria-label="AI Article Studio ホーム"><span aria-hidden="true">✦</span><strong>AI ARTICLE <em>STUDIO</em></strong></Link>
        <div className="help-top-actions"><Link href="/manual">マニュアル</Link><Link href="/settings">設定</Link></div>
      </header>

      <main className="help-main">
        <section className="help-hero compact">
          <p className="eyebrow">Q&A</p>
          <h1>よくある質問</h1>
          <p>使い方、記事・画像・SNS、PWA表示、利用権、トラブル時の確認方法をまとめています。</p>
          <div className="help-hero-actions"><Link href="/manual">マニュアルを見る</Link><Link className="secondary" href="/settings">設定を開く</Link></div>
        </section>

        <div className="faq-groups">
          {FAQ_GROUPS.map((group) => (
            <section className="faq-group" key={group.title}>
              <h2>{group.title}</h2>
              <div>
                {group.items.map(([question, answer]) => (
                  <details key={question} className="faq-item">
                    <summary>{question}<span aria-hidden="true">＋</span></summary>
                    <p>{answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="help-next-card">
          <div><p className="eyebrow">MANUAL</p><h2>操作手順を順番に確認したい場合</h2><p>基本操作から記事、画像、SNS、ナビ設定まで、マニュアルで順番に確認できます。</p></div>
          <Link href="/manual">マニュアルへ →</Link>
        </section>
      </main>
    </div>
  );
}
