export type SideJobInput = {
  weeklyHours: number;
  faceReveal: "yes" | "no" | "either";
  budget: "low" | "medium" | "flexible";
  writing: number;
  image: number;
  video: number;
  sales: number;
  experience: "beginner" | "some";
  goal: "first_income" | "stable" | "skill";
};

export type SideJobSuggestion = {
  id: string;
  title: string;
  score: number;
  reason: string[];
  firstSteps: string[];
};

type Candidate = {
  id: string;
  title: string;
  weights: { writing: number; image: number; video: number; sales: number };
  minHours: number;
  prefersFace: boolean;
  budgetNeed: "low" | "medium";
  firstSteps: string[];
};

const candidates: Candidate[] = [
  {
    id: "content-sales",
    title: "note / Tips / Brain コンテンツ販売",
    weights: { writing: 4, image: 1, video: 0, sales: 2 },
    minHours: 3,
    prefersFace: false,
    budgetNeed: "low",
    firstSteps: ["読者の悩みを1つに絞る", "無料記事で需要を確認する", "有料部分の成果物を先に設計する"],
  },
  {
    id: "affiliate",
    title: "記事・SNSアフィリエイト",
    weights: { writing: 3, image: 1, video: 1, sales: 3 },
    minHours: 4,
    prefersFace: false,
    budgetNeed: "low",
    firstSteps: ["扱うテーマと読者を決める", "比較・選び方コンテンツを作る", "広告であることを明示しながら導線を検証する"],
  },
  {
    id: "digital-products",
    title: "PDF・テンプレート等のデジタル商品販売",
    weights: { writing: 3, image: 2, video: 0, sales: 3 },
    minHours: 4,
    prefersFace: false,
    budgetNeed: "low",
    firstSteps: ["繰り返し使える成果物を1つ決める", "最小版を作る", "SNSや無料記事から利用シーンを伝える"],
  },
  {
    id: "sns-ops",
    title: "SNS運用代行・投稿作成",
    weights: { writing: 3, image: 2, video: 2, sales: 2 },
    minHours: 6,
    prefersFace: false,
    budgetNeed: "low",
    firstSteps: ["1業種に絞った投稿サンプルを作る", "運用範囲と納品物を定義する", "実績を創作せずサンプルとして提示する"],
  },
  {
    id: "short-video",
    title: "ショート動画・配信切り抜き制作",
    weights: { writing: 1, image: 2, video: 4, sales: 1 },
    minHours: 6,
    prefersFace: false,
    budgetNeed: "medium",
    firstSteps: ["15〜60秒の編集テンプレートを作る", "字幕・冒頭フック・音量を標準化する", "権利確認済み素材だけでポートフォリオを作る"],
  },
  {
    id: "creator",
    title: "YouTube / TikTok / 配信クリエイター",
    weights: { writing: 1, image: 2, video: 4, sales: 2 },
    minHours: 8,
    prefersFace: true,
    budgetNeed: "medium",
    firstSteps: ["テーマと配信/動画の柱を3つ決める", "週単位の無理のない投稿頻度を決める", "SNSから動画への導線を統一する"],
  },
  {
    id: "ai-writing",
    title: "AI活用の記事・投稿制作支援",
    weights: { writing: 4, image: 1, video: 0, sales: 2 },
    minHours: 3,
    prefersFace: false,
    budgetNeed: "low",
    firstSteps: ["対象業種を1つ決める", "AI生成→人の検品まで含む納品フローを作る", "サンプルとチェックリストを用意する"],
  },
];

function skillScore(value: number, weight: number): number {
  const normalized = Math.max(0, Math.min(5, Math.trunc(value)));
  return normalized * weight;
}

export function rankSideJobs(input: SideJobInput): SideJobSuggestion[] {
  if (!Number.isFinite(input.weeklyHours) || input.weeklyHours < 1 || input.weeklyHours > 100) {
    throw new Error("週の作業時間は1〜100時間で指定してください。");
  }

  return candidates
    .map((candidate) => {
      let score =
        skillScore(input.writing, candidate.weights.writing) +
        skillScore(input.image, candidate.weights.image) +
        skillScore(input.video, candidate.weights.video) +
        skillScore(input.sales, candidate.weights.sales);
      const reason: string[] = [];

      if (input.weeklyHours >= candidate.minHours) {
        score += 8;
        reason.push(`週${input.weeklyHours}時間なら最低作業量を確保しやすい`);
      } else {
        score -= 8;
        reason.push(`目安として週${candidate.minHours}時間以上あると進めやすい`);
      }

      if (input.faceReveal === "no" && candidate.prefersFace) {
        score -= 5;
        reason.push("顔出しなしでも可能だが、企画・キャラクター・画面構成で補う必要がある");
      } else if (input.faceReveal !== "no" && candidate.prefersFace) {
        score += 3;
        reason.push("顔出し可否の条件と相性が良い");
      } else {
        reason.push("顔出しなしでも進めやすい");
      }

      if (input.budget === "low" && candidate.budgetNeed === "low") {
        score += 4;
        reason.push("初期費用を抑えて始めやすい");
      }
      if (input.experience === "beginner") {
        score += candidate.minHours <= 4 ? 3 : 0;
      }
      if (input.goal === "skill" && ["sns-ops", "short-video", "ai-writing"].includes(candidate.id)) {
        score += 4;
        reason.push("受託にも転用しやすいスキルを積み上げやすい");
      }
      if (input.goal === "first_income" && ["content-sales", "digital-products", "ai-writing"].includes(candidate.id)) {
        score += 3;
        reason.push("小さな成果物から検証を始めやすい");
      }

      return {
        id: candidate.id,
        title: candidate.title,
        score,
        reason: reason.slice(0, 4),
        firstSteps: candidate.firstSteps,
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ja"))
    .slice(0, 5);
}

export function buildSideJobStrategyPrompt(
  input: SideJobInput,
  suggestions: SideJobSuggestion[],
): string {
  return `あなたはAI副業の企画編集者です。以下の条件と候補を元に、初心者が現実的に試せる30日プランを作成してください。\n\n【絶対ルール】\n- 収益額・成功率・フォロワー数などを保証しない。\n- 架空の実績、体験談、顧客レビューを作らない。\n- 未確認のサービス料金・規約・最新仕様を断定しない。\n- 高額な先行投資を前提にしない。\n- 違法行為、無断転載、スパム、なりすましを提案しない。\n\n【本人条件】\n週の作業時間: ${input.weeklyHours}時間\n顔出し: ${input.faceReveal}\n予算: ${input.budget}\n文章得意度: ${input.writing}/5\n画像得意度: ${input.image}/5\n動画得意度: ${input.video}/5\n営業得意度: ${input.sales}/5\n経験: ${input.experience}\n目標: ${input.goal}\n\n【候補】\n${suggestions.map((item, index) => `${index + 1}. ${item.title}\n理由: ${item.reason.join(" / ")}`).join("\n")}\n\n【出力】\n- 最優先1案と、選ぶ理由\n- 1週目〜4週目の作業\n- 1回あたりの作業単位\n- 必要な成果物テンプレート\n- 続ける/方向転換する判断基準\n- 収益保証ではなく、検証可能な小さな目標で作る`;
}
