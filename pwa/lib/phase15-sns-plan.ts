import { compileKnowledgeContext } from "@/lib/knowledge-engine";
import { buildUserPromptContext, getRuntimeWritingProfile } from "@/lib/user-personalization";
import { socialPlatformLabel } from "@/lib/social-links";

export type SnsLaunchPlatform = "x" | "instagram" | "threads" | "tiktok" | "facebook" | "linkedin" | "pinterest" | "youtube";
export type SnsLaunchGoal =
  | "article_sales"
  | "affiliate"
  | "digital_product"
  | "client_work"
  | "creator"
  | "membership"
  | "app_service"
  | "lead_generation";

export type SnsLaunchInput = {
  platform: SnsLaunchPlatform;
  goal: SnsLaunchGoal;
  niche: string;
  audience: string;
  strength: string;
  faceReveal: "yes" | "no" | "either";
  weeklyPosts: number;
  tone: string;
  offer: string;
};

const platformRules: Record<SnsLaunchPlatform, string> = {
  x: "単発投稿・連続投稿・返信で関係を作り、プロフィールから収益導線までの一貫性を重視する。",
  instagram: "フィード・カルーセル・ストーリー・リールへ展開できる投稿の柱を作り、プロフィールと各投稿の役割を分ける。",
  threads: "会話の始まりになる短い投稿と、経験を創作しない知識共有を組み合わせ、プロフィール導線を自然に設計する。",
  tiktok: "短尺動画の冒頭フック・本題・CTAを分け、無理に毎回販売へ誘導せず視聴価値を先に作る。",
  facebook: "文脈を丁寧に伝える投稿とコミュニティでの交流を組み合わせ、過度な宣伝投稿を避ける。",
  linkedin: "仕事・専門知識・学びを軸に、実績を誇張せず実務に役立つ投稿からプロフィール導線へつなげる。",
  pinterest: "検索・保存を意識したテーマ設計と画像・ボードの整理を行い、記事や商品ページへ自然につなげる。",
  youtube: "通常動画・Shorts・コミュニティ投稿の役割を分け、SNS外の動画コンテンツまで一貫したテーマで設計する。",
};

const goalRules: Record<SnsLaunchGoal, string> = {
  article_sales: "無料投稿で理解と信頼を作り、note・Tips・Brain等の記事へ自然につなげる。",
  affiliate: "広告・紹介であることを適切に明示し、比較・選び方・利用条件の説明からリンクへつなげる。",
  digital_product: "PDF・テンプレート等が解決する作業を具体化し、無料サンプルや利用例から商品へつなげる。",
  client_work: "架空実績を作らず、サンプル・作業範囲・納品物・対応方針を見せて相談導線へつなげる。",
  creator: "配信・動画・ショート等の主コンテンツへSNSから自然に誘導し、投稿だけで完結させない。",
  membership: "継続的に受け取れる価値を無料投稿で示し、月額サービスやメンバーシップへ急かさず案内する。",
  app_service: "アプリやWebサービスが解決する課題と利用場面を具体化し、試用・案内ページへ自然につなげる。",
  lead_generation: "相談できる内容・対象者・対応範囲を明確にし、押し売りにならない問い合わせ導線を作る。",
};

export function buildSnsLaunchPrompt(input: SnsLaunchInput): string {
  const niche = input.niche.trim() || "AIおまかせ";
  const audience = input.audience.trim() || "初心者";
  const strength = input.strength.trim() || "未指定";
  const tone = input.tone.trim() || "親しみやすく分かりやすい";
  const offer = input.offer.trim() || "まだ未定";
  const weeklyPosts = Math.max(1, Math.min(21, Math.trunc(input.weeklyPosts) || 1));
  const platformName = socialPlatformLabel(input.platform);
  const knowledge = compileKnowledgeContext({
    task: "social",
    genre: "SNS運用",
    subgenre: platformName,
    audience,
    purpose: `${goalRules[input.goal]} テーマは「${niche}」。`,
  });
  const promptOptimization = buildUserPromptContext(getRuntimeWritingProfile(), "social");

  return `あなたは日本語SNSの編集者兼アカウント設計者です。次の条件で、収益保証をせず、実行可能なSNS立ち上げ設計を作成してください。\n\n【絶対ルール】\n- ユーザーが入力していない実績・経験・顧客数・売上・フォロワー数・レビューを創作しない。\n- 未確認のアルゴリズム、最新仕様、料金、規約、収益額を断定しない。\n- 他人の投稿、プロフィール、ブランド表現をコピー・近似模倣しない。\n- スパム、無断転載、なりすまし、誇大広告を提案しない。\n- 成果を保証せず、検証可能な行動目標で設計する。\n- テーマから読者の属性を勝手に決めず、入力された対象読者を優先する。\n\n${knowledge.promptBlock}${promptOptimization ? `\n\n${promptOptimization}` : ""}\n\n【アカウント条件】\nSNS: ${platformName}\n目的: ${input.goal}\nジャンル/テーマ: ${niche}\n対象読者: ${audience}\n活かしたい強み: ${strength}\n顔出し: ${input.faceReveal}\n投稿頻度の目安: 週${weeklyPosts}回\n文章トーン: ${tone}\n販売・誘導したいもの: ${offer}\n\n【SNS別方針】\n${platformRules[input.platform]}\n\n【収益導線方針】\n${goalRules[input.goal]}\n\n【出力してほしいもの】\n1. アカウントの役割を1文で定義\n2. 表示名候補5案\n3. 自己紹介文候補5案\n4. アイコン・ヘッダーの方向性（既存作品・実在ブランドの模倣なし）\n5. 投稿の柱を3〜5本\n6. 最初の10投稿の具体案\n7. 1週間の運用テンプレート\n8. フォロー後に何を見てもらうかの導線\n9. 無料コンテンツ→信頼形成→商品/記事/相談への導線\n10. 30日後に確認する改善指標。ただし架空の目標値は置かず、比較方法を示す\n11. やらないこと・注意点のチェックリスト\n\n出力は日本語。抽象論ではなく、そのまま運用メモとして使える具体性にしてください。`;
}
