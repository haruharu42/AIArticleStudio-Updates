export type PromptProfileInput = {
  publicationTarget: "note" | "tips" | "brain" | "blog";
  articleType: "free" | "paid";
  genre: string;
  subgenre: string;
  ageGroup: string;
  gender: string;
};

type Profile = {
  expertise: string[];
  deliverables: string[];
  cautions: string[];
};

const defaultProfile: Profile = {
  expertise: [
    "初心者が迷わない順番で、前提→判断基準→手順→次の行動へつなげる",
    "抽象論だけで終わらせず、具体例・チェックリスト・比較軸を使う",
  ],
  deliverables: ["実践手順", "判断チェックリスト", "よくある失敗と回避策"],
  cautions: ["専門家資格が必要な領域では断定せず、必要に応じて一次情報確認を促す"],
};

const profiles: Array<{ match: RegExp; profile: Profile }> = [
  {
    match: /AI\s*副業|生成AI|ChatGPT|AIおまかせ/i,
    profile: {
      expertise: [
        "作業工程をAIに任せる部分と人が確認する部分に分ける",
        "初心者が実行できるツール選定・作業時間・検品ポイントを示す",
        "収益化は販売先、集客、制作、改善の流れで整理する",
      ],
      deliverables: [
        "最短スタート手順",
        "AIへ渡すプロンプト例",
        "人が確認する品質チェックリスト",
        "副業タイプ比較表",
      ],
      cautions: [
        "収益額や成果を保証しない",
        "各AIサービスの料金・利用上限・最新機能は未確認のまま断定しない",
        "著作権・商用利用・各サービス規約を確認する視点を含める",
      ],
    },
  },
  {
    match: /美容|スキンケア|コスメ|メイク/i,
    profile: {
      expertise: [
        "悩み、目的、予算、使用タイミングで選択肢を整理する",
        "初心者が失敗しやすい順番や使い分けを具体化する",
      ],
      deliverables: ["選び方チェックリスト", "朝/夜などのルーティン例", "比較観点"],
      cautions: [
        "診断・治療効果を断定しない",
        "肌質や体質による個人差を明示する",
        "成分・価格・在庫・キャンペーンは最新確認なしに断定しない",
      ],
    },
  },
  {
    match: /ガジェット|スマホ|PC|パソコン|イヤホン|ルーター|デバイス/i,
    profile: {
      expertise: [
        "用途→必要機能→予算→候補比較の順で選べるようにする",
        "スペック値そのものより、読者の使い方にどう影響するか説明する",
      ],
      deliverables: ["用途別比較表", "購入前チェックリスト", "初期設定手順"],
      cautions: [
        "価格・在庫・OS対応・最新仕様は一次情報確認なしに断定しない",
        "未使用の商品を実際に使ったようにレビューしない",
      ],
    },
  },
  {
    match: /生活|暮らし|家事|時間管理|節約/i,
    profile: {
      expertise: [
        "負担を増やさず続けられる小さな変更から設計する",
        "家事・時間・お金など複数軸を優先順位で整理する",
      ],
      deliverables: ["今日からできる3ステップ", "見直しチェックリスト", "1週間の実行例"],
      cautions: [
        "家計・投資・法律など専門判断が必要な内容を断定しない",
        "効果や節約額を根拠なく保証しない",
      ],
    },
  },
  {
    match: /SNS|X\b|Instagram|Threads|TikTok|YouTube/i,
    profile: {
      expertise: [
        "誰に何を届けるか、投稿柱、プロフィール、導線、改善の順で設計する",
        "フォロー獲得だけでなく、記事・商品・問い合わせへの自然な導線を作る",
      ],
      deliverables: ["投稿柱3〜5本", "投稿テンプレート", "プロフィール案", "CTA例"],
      cautions: [
        "フォロワー数・再生数・売上を保証しない",
        "プラットフォーム仕様や文字数制限は変更され得るため最新確認を前提にする",
      ],
    },
  },
];

const platformRules: Record<PromptProfileInput["publicationTarget"], string[]> = {
  note: [
    "読みやすい導入と共感を使いながら、誇張せず本文価値を早めに示す",
    "有料記事は無料範囲だけでも学びがあり、購入後に得られる成果物を明確にする",
  ],
  tips: [
    "実務で再利用できるテンプレート・手順・チェックリストを重視する",
    "結論と成果物を先に把握できる構成にする",
  ],
  brain: [
    "教材として段階的に学べる章立てと再現手順を重視する",
    "購入判断に必要な対象者・非対象者・前提条件を明確にする",
  ],
  blog: [
    "検索意図に対する結論を早めに示し、見出しだけでも内容を追える構造にする",
    "必要に応じて比較・FAQ・次に読む内容への内部導線候補を入れる",
  ],
};

export function getPromptSpecialization(input: PromptProfileInput): string {
  const haystack = `${input.genre} ${input.subgenre}`.trim();
  const profile = profiles.find((entry) => entry.match.test(haystack))?.profile ?? defaultProfile;
  const paidRules =
    input.articleType === "paid"
      ? [
          "有料部分では無料部分の繰り返しではなく、具体的手順・テンプレート・判断基準など実行価値を増やす",
          "購入を過度に煽らず、対象者と得られる内容を明確にする",
        ]
      : ["無料記事でも読者が1つ以上実行できる具体策を持ち帰れる構成にする"];

  const lines = [
    "【ジャンル・掲載先専用編集ルール】",
    `対象: ${input.ageGroup || "AIおまかせ"} / ${input.gender || "AIおまかせ"}`,
    "専門性:",
    ...profile.expertise.map((value) => `- ${value}`),
    "価値が出やすい成果物:",
    ...profile.deliverables.map((value) => `- ${value}`),
    "掲載先ルール:",
    ...platformRules[input.publicationTarget].map((value) => `- ${value}`),
    "記事タイプルール:",
    ...paidRules.map((value) => `- ${value}`),
    "注意:",
    ...profile.cautions.map((value) => `- ${value}`),
  ];
  return lines.join("\n");
}
