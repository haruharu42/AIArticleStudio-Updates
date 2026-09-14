import type { PresetOption } from "@/components/preset-select";

export const TONE_OPTIONS: readonly PresetOption[] = [
  { value: "親しみやすく具体的", label: "親しみやすく具体的" },
  { value: "やさしく初心者向け", label: "やさしく初心者向け" },
  { value: "丁寧で信頼感のある", label: "丁寧で信頼感のある" },
  { value: "専門的だが分かりやすい", label: "専門的だが分かりやすい" },
  { value: "簡潔でテンポよく", label: "簡潔でテンポよく" },
  { value: "会話調で自然", label: "会話調で自然" },
  { value: "落ち着いて誠実", label: "落ち着いて誠実" },
  { value: "明るく前向き", label: "明るく前向き" },
  { value: "共感を重視", label: "共感を重視" },
  { value: "比較・判断しやすく客観的", label: "比較・判断しやすく客観的" },
  { value: "ビジネス向けに端的", label: "ビジネス向けに端的" },
  { value: "柔らかく背中を押す", label: "柔らかく背中を押す" },
];

export const AUDIENCE_OPTIONS: readonly PresetOption[] = [
  { value: "初心者", label: "初心者" },
  { value: "未経験者", label: "未経験者" },
  { value: "20代・初心者", label: "20代・初心者" },
  { value: "30代・初心者", label: "30代・初心者" },
  { value: "40代・初心者", label: "40代・初心者" },
  { value: "50代・初心者", label: "50代・初心者" },
  { value: "60代以上・初心者", label: "60代以上・初心者" },
  { value: "会社員", label: "会社員" },
  { value: "主婦・主夫", label: "主婦・主夫" },
  { value: "フリーランス", label: "フリーランス" },
  { value: "個人事業主", label: "個人事業主" },
  { value: "クリエイター", label: "クリエイター" },
  { value: "副業を始めたい人", label: "副業を始めたい人" },
  { value: "SNS運用を始めたい人", label: "SNS運用を始めたい人" },
];

export const STRENGTH_OPTIONS: readonly PresetOption[] = [
  { value: "文章を分かりやすく整理する", label: "文章を分かりやすく整理する" },
  { value: "専門知識をかみ砕いて伝える", label: "専門知識をかみ砕いて伝える" },
  { value: "画像・デザインを作る", label: "画像・デザインを作る" },
  { value: "動画編集・ショート動画", label: "動画編集・ショート動画" },
  { value: "調査・比較・情報整理", label: "調査・比較・情報整理" },
  { value: "人の悩みを聞いて整理する", label: "人の悩みを聞いて整理する" },
  { value: "継続してコツコツ投稿する", label: "継続してコツコツ投稿する" },
  { value: "商品・サービスの魅力を説明する", label: "商品・サービスの魅力を説明する" },
  { value: "AIツールを活用する", label: "AIツールを活用する" },
  { value: "ゲーム・配信・エンタメ", label: "ゲーム・配信・エンタメ" },
];

export const OFFER_OPTIONS: readonly PresetOption[] = [
  { value: "まだ未定", label: "まだ未定" },
  { value: "note・Tips・Brain等の記事", label: "note・Tips・Brain等の記事" },
  { value: "月額サービス・メンバーシップ", label: "月額サービス・メンバーシップ" },
  { value: "アフィリエイト商品・サービス", label: "アフィリエイト商品・サービス" },
  { value: "PDF・テンプレート・チェックリスト", label: "PDF・テンプレート・チェックリスト" },
  { value: "オンライン講座・教材", label: "オンライン講座・教材" },
  { value: "SNS運用代行・制作受託", label: "SNS運用代行・制作受託" },
  { value: "相談・コンサルティング", label: "相談・コンサルティング" },
  { value: "YouTube・TikTok・配信", label: "YouTube・TikTok・配信" },
  { value: "自社サービス・アプリ", label: "自社サービス・アプリ" },
];

export const CHARACTER_LIMIT_OPTIONS: readonly PresetOption[] = [
  { value: "80", label: "約80文字（短い）" },
  { value: "100", label: "約100文字" },
  { value: "140", label: "約140文字" },
  { value: "200", label: "約200文字" },
  { value: "300", label: "約300文字" },
  { value: "500", label: "約500文字" },
  { value: "800", label: "約800文字" },
  { value: "1000", label: "約1,000文字" },
  { value: "1500", label: "約1,500文字" },
  { value: "2000", label: "約2,000文字" },
];

export const WEEKLY_POST_OPTIONS: readonly PresetOption[] = [
  { value: "1", label: "週1回" },
  { value: "2", label: "週2回" },
  { value: "3", label: "週3回" },
  { value: "4", label: "週4回" },
  { value: "5", label: "週5回" },
  { value: "7", label: "毎日（週7回）" },
  { value: "10", label: "週10回" },
  { value: "14", label: "1日2回程度（週14回）" },
  { value: "21", label: "1日3回程度（週21回）" },
];

export const WEEKLY_HOURS_OPTIONS: readonly PresetOption[] = [
  { value: "1", label: "週1時間" },
  { value: "2", label: "週2時間" },
  { value: "3", label: "週3時間" },
  { value: "5", label: "週5時間" },
  { value: "7", label: "週7時間" },
  { value: "10", label: "週10時間" },
  { value: "15", label: "週15時間" },
  { value: "20", label: "週20時間" },
  { value: "30", label: "週30時間" },
  { value: "40", label: "週40時間" },
];
