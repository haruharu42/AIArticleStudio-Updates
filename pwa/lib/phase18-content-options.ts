export const GENRE_OPTIONS = [
  "AI副業",
  "生活・暮らし",
  "美容",
  "ガジェット",
  "仕事・キャリア",
  "お金・副業",
  "SNS運用",
  "学習・自己成長",
  "健康・フィットネス",
  "子育て・教育",
  "旅行",
  "料理・グルメ",
  "趣味・エンタメ",
  "ペット",
  "その他",
] as const;

export const SUBGENRE_OPTIONS: Record<string, readonly string[]> = {
  "AI副業": ["AIおまかせ", "ChatGPT", "Claude", "Gemini", "AIライティング", "画像生成AI", "AI動画制作", "AIツール活用", "AI副業の始め方", "プロンプト活用", "コンテンツ販売", "業務効率化", "その他"],
  "生活・暮らし": ["AIおまかせ", "家事", "時短", "整理収納", "節約", "暮らし改善", "掃除", "防災", "引っ越し", "日用品", "その他"],
  "美容": ["AIおまかせ", "スキンケア", "ヘアケア", "メイク", "ボディケア", "ネイル", "美容習慣", "コスメ選び", "その他"],
  "ガジェット": ["AIおまかせ", "スマホ", "PC", "タブレット", "周辺機器", "イヤホン・オーディオ", "スマートホーム", "初心者ガイド", "比較・選び方", "設定・使い方", "その他"],
  "仕事・キャリア": ["AIおまかせ", "転職", "スキルアップ", "働き方", "時間管理", "在宅ワーク", "仕事術", "資格・学び直し", "フリーランス", "その他"],
  "お金・副業": ["AIおまかせ", "副業入門", "家計管理", "節約", "収入管理", "固定費見直し", "仕事選び", "初心者向け", "その他"],
  "SNS運用": ["AIおまかせ", "X", "Instagram", "Threads", "TikTok", "YouTube", "YouTube Shorts", "集客", "プロフィール設計", "投稿企画", "分析・改善", "その他"],
  "学習・自己成長": ["AIおまかせ", "勉強法", "資格", "読書", "習慣化", "時間管理", "語学", "リスキリング", "目標設定", "その他"],
  "健康・フィットネス": ["AIおまかせ", "運動習慣", "筋トレ", "ストレッチ", "睡眠", "食生活", "ウォーキング", "健康管理", "その他"],
  "子育て・教育": ["AIおまかせ", "乳幼児", "小学生", "中高生", "家庭学習", "知育", "子育ての工夫", "進路・学び", "その他"],
  "旅行": ["AIおまかせ", "国内旅行", "海外旅行", "一人旅", "家族旅行", "旅程作成", "持ち物", "交通・移動", "宿泊", "その他"],
  "料理・グルメ": ["AIおまかせ", "時短料理", "作り置き", "節約料理", "初心者レシピ", "お菓子", "外食・グルメ", "食材活用", "その他"],
  "趣味・エンタメ": ["AIおまかせ", "ゲーム", "配信", "写真", "動画", "音楽", "読書", "映画・ドラマ", "ハンドメイド", "その他"],
  "ペット": ["AIおまかせ", "犬", "猫", "小動物", "飼育環境", "しつけ", "日常ケア", "防災", "初心者向け", "その他"],
  "その他": ["AIおまかせ", "その他"],
};

export const AGE_GROUP_OPTIONS = [
  "AIおまかせ",
  "10代",
  "20代",
  "30代",
  "40代",
  "50代",
  "60代",
  "70代以上",
] as const;

export const GENDER_OPTIONS = ["AIおまかせ", "男性", "女性", "どちらでも"] as const;

export const TARGET_LENGTH_OPTIONS = [
  { value: 1000, label: "約1,000文字（短め）" },
  { value: 2000, label: "約2,000文字" },
  { value: 3000, label: "約3,000文字" },
  { value: 5000, label: "約5,000文字（標準）" },
  { value: 8000, label: "約8,000文字（詳しく）" },
  { value: 10000, label: "約10,000文字（長め）" },
] as const;

export function isPresetGenre(value: string): boolean {
  return GENRE_OPTIONS.includes(value as (typeof GENRE_OPTIONS)[number]) && value !== "その他";
}

export function genreSelectionValue(value: string): string {
  return isPresetGenre(value) ? value : "その他";
}

export function isCustomGenre(value: string): boolean {
  const clean = value.trim();
  return Boolean(clean) && clean !== "その他" && !isPresetGenre(clean);
}

export function subgenreOptionsFor(genre: string): readonly string[] {
  return SUBGENRE_OPTIONS[isPresetGenre(genre) ? genre : "その他"] ?? ["AIおまかせ", "その他"];
}

export function isPresetSubgenre(genre: string, value: string): boolean {
  return subgenreOptionsFor(genre).includes(value) && value !== "その他";
}

export function subgenreSelectionValue(genre: string, value: string): string {
  return isPresetSubgenre(genre, value) ? value : "その他";
}

export function isCustomSubgenre(genre: string, value: string): boolean {
  const clean = value.trim();
  return Boolean(clean) && clean !== "その他" && clean !== "AIおまかせ" && !isPresetSubgenre(genre, clean);
}
