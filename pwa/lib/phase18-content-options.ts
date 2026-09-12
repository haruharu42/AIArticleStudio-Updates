export const GENRE_OPTIONS = [
  "AI副業",
  "生活・暮らし",
  "美容",
  "ガジェット",
  "仕事・キャリア",
  "お金・副業",
  "SNS運用",
  "学習・自己成長",
  "その他",
] as const;

export const SUBGENRE_OPTIONS: Record<string, readonly string[]> = {
  "AI副業": ["AIおまかせ", "ChatGPT", "AIライティング", "画像生成AI", "AIツール活用", "AI副業の始め方", "プロンプト活用", "その他"],
  "生活・暮らし": ["AIおまかせ", "家事", "時短", "整理収納", "節約", "暮らし改善", "その他"],
  "美容": ["AIおまかせ", "スキンケア", "ヘアケア", "メイク", "ボディケア", "美容習慣", "その他"],
  "ガジェット": ["AIおまかせ", "スマホ", "PC", "周辺機器", "初心者ガイド", "比較・選び方", "その他"],
  "仕事・キャリア": ["AIおまかせ", "転職", "スキルアップ", "働き方", "時間管理", "在宅ワーク", "その他"],
  "お金・副業": ["AIおまかせ", "副業入門", "家計管理", "節約", "収入管理", "初心者向け", "その他"],
  "SNS運用": ["AIおまかせ", "X", "Instagram", "Threads", "TikTok", "YouTube", "集客", "その他"],
  "学習・自己成長": ["AIおまかせ", "勉強法", "資格", "読書", "習慣化", "時間管理", "その他"],
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

export function subgenreOptionsFor(genre: string): readonly string[] {
  return SUBGENRE_OPTIONS[genre] ?? ["AIおまかせ", "その他"];
}
