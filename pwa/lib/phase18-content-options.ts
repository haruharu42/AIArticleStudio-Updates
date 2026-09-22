export const GENRE_OPTIONS = [
  "AI副業",
  "AI・テクノロジー",
  "生活・暮らし",
  "美容",
  "ファッション",
  "ガジェット",
  "Web・IT",
  "仕事・キャリア",
  "ビジネス・経営",
  "マーケティング",
  "お金・副業",
  "投資・資産形成",
  "SNS運用",
  "学習・自己成長",
  "健康・フィットネス",
  "子育て・教育",
  "恋愛・人間関係",
  "住まい・インテリア",
  "旅行",
  "料理・グルメ",
  "趣味・エンタメ",
  "ゲーム・配信",
  "写真・カメラ",
  "ハンドメイド",
  "自動車・バイク",
  "ペット",
  "シニア・終活",
  "地域・ローカル",
  "その他",
] as const;

export const SUBGENRE_OPTIONS: Record<string, readonly string[]> = {
  "AI副業": ["AIおまかせ", "ChatGPT", "Claude", "Gemini", "AIライティング", "画像生成AI", "AI動画制作", "AIツール活用", "AI副業の始め方", "プロンプト活用", "コンテンツ販売", "業務効率化", "AI受託", "AIテンプレート販売", "その他"],
  "AI・テクノロジー": ["AIおまかせ", "生成AI", "LLM", "AIエージェント", "画像生成", "動画生成", "音声AI", "自動化", "ノーコード", "最新ツール解説", "AI活用事例", "その他"],
  "生活・暮らし": ["AIおまかせ", "家事", "時短", "整理収納", "節約", "暮らし改善", "掃除", "洗濯", "防災", "引っ越し", "日用品", "一人暮らし", "その他"],
  "美容": ["AIおまかせ", "スキンケア", "ヘアケア", "メイク", "ボディケア", "ネイル", "美容習慣", "コスメ選び", "エイジングケア", "美容家電", "その他"],
  "ファッション": ["AIおまかせ", "メンズ", "レディース", "着回し", "季節コーデ", "プチプラ", "仕事服", "小物・バッグ", "靴", "体型別コーデ", "その他"],
  "ガジェット": ["AIおまかせ", "スマホ", "PC", "タブレット", "周辺機器", "イヤホン・オーディオ", "スマートウォッチ", "スマートホーム", "初心者ガイド", "比較・選び方", "設定・使い方", "その他"],
  "Web・IT": ["AIおまかせ", "Web制作", "プログラミング", "クラウド", "セキュリティ", "データベース", "アプリ開発", "業務自動化", "ノーコード", "初心者学習", "その他"],
  "仕事・キャリア": ["AIおまかせ", "転職", "スキルアップ", "働き方", "時間管理", "在宅ワーク", "仕事術", "資格・学び直し", "フリーランス", "副業との両立", "その他"],
  "ビジネス・経営": ["AIおまかせ", "起業", "個人事業", "事業計画", "業務改善", "顧客対応", "営業", "チーム運営", "商品設計", "小規模ビジネス", "その他"],
  "マーケティング": ["AIおまかせ", "コンテンツマーケティング", "SEO", "SNSマーケティング", "広告", "コピーライティング", "顧客理解", "販売導線", "メールマーケティング", "分析・改善", "その他"],
  "お金・副業": ["AIおまかせ", "副業入門", "家計管理", "節約", "収入管理", "固定費見直し", "仕事選び", "初心者向け", "デジタル販売", "在宅副業", "その他"],
  "投資・資産形成": ["AIおまかせ", "資産形成入門", "家計と投資", "長期投資", "積立", "株式", "投資信託", "リスク管理", "初心者向け", "制度の調べ方", "その他"],
  "SNS運用": ["AIおまかせ", "X", "Instagram", "Threads", "TikTok", "Facebook", "LinkedIn", "Pinterest", "YouTube", "YouTube Shorts", "集客", "プロフィール設計", "投稿企画", "分析・改善", "その他"],
  "学習・自己成長": ["AIおまかせ", "勉強法", "資格", "読書", "習慣化", "時間管理", "語学", "リスキリング", "目標設定", "ノート術", "その他"],
  "健康・フィットネス": ["AIおまかせ", "運動習慣", "筋トレ", "ストレッチ", "睡眠", "食生活", "ウォーキング", "健康管理", "姿勢", "初心者運動", "その他"],
  "子育て・教育": ["AIおまかせ", "乳幼児", "小学生", "中高生", "家庭学習", "知育", "子育ての工夫", "進路・学び", "保護者向け", "デジタル学習", "その他"],
  "恋愛・人間関係": ["AIおまかせ", "コミュニケーション", "恋愛", "夫婦・パートナー", "友人関係", "職場の人間関係", "境界線", "会話", "自己理解", "その他"],
  "住まい・インテリア": ["AIおまかせ", "インテリア", "収納", "家具選び", "賃貸", "戸建て", "マンション", "DIY", "スマートホーム", "模様替え", "その他"],
  "旅行": ["AIおまかせ", "国内旅行", "海外旅行", "一人旅", "家族旅行", "カップル旅行", "旅程作成", "持ち物", "交通・移動", "宿泊", "観光", "その他"],
  "料理・グルメ": ["AIおまかせ", "時短料理", "作り置き", "節約料理", "初心者レシピ", "お菓子", "外食・グルメ", "食材活用", "お弁当", "調理家電", "その他"],
  "趣味・エンタメ": ["AIおまかせ", "ゲーム", "配信", "写真", "動画", "音楽", "読書", "映画・ドラマ", "ハンドメイド", "コレクション", "その他"],
  "ゲーム・配信": ["AIおまかせ", "ゲームレビュー", "初心者攻略", "配信準備", "OBS", "VTuber", "YouTube配信", "Twitch", "配信機材", "ショート動画", "コミュニティ運営", "その他"],
  "写真・カメラ": ["AIおまかせ", "スマホ撮影", "カメラ入門", "人物撮影", "風景撮影", "商品撮影", "構図", "編集・レタッチ", "機材選び", "SNS写真", "その他"],
  "ハンドメイド": ["AIおまかせ", "アクセサリー", "イラスト", "手芸", "雑貨", "デジタル素材", "販売準備", "写真撮影", "価格設計", "SNS集客", "その他"],
  "自動車・バイク": ["AIおまかせ", "車選び", "バイク選び", "初心者", "メンテナンス", "洗車", "車内用品", "ツーリング", "ドライブ", "維持費", "その他"],
  "ペット": ["AIおまかせ", "犬", "猫", "小動物", "飼育環境", "しつけ", "日常ケア", "防災", "初心者向け", "用品選び", "その他"],
  "シニア・終活": ["AIおまかせ", "デジタル活用", "スマホ入門", "暮らし", "健康習慣", "趣味", "家族との連絡", "整理", "終活入門", "防犯", "その他"],
  "地域・ローカル": ["AIおまかせ", "地域情報", "観光", "イベント", "飲食店", "暮らし", "移住", "地域ビジネス", "商店", "コミュニティ", "その他"],
  "その他": ["AIおまかせ", "その他"],
};

export const AGE_GROUP_OPTIONS = [
  "AIおまかせ",
  "全年代",
  "10代",
  "20代",
  "30代",
  "40代",
  "50代",
  "60代",
  "70代",
  "80代以上",
  "学生",
  "社会人",
  "シニア層",
] as const;

export const GENDER_OPTIONS = ["AIおまかせ", "男性", "女性", "どちらでも", "性別を限定しない"] as const;

export const PAID_ARTICLE_PRICE_OPTIONS = [
  { value: 100, label: "100円（お試し・先行販売）" },
  { value: 300, label: "300円（低価格の入口）" },
  { value: 500, label: "500円（手に取りやすい価格）" },
  { value: 980, label: "980円（読み物系の目安に近い）" },
  { value: 1480, label: "1,480円" },
  { value: 1980, label: "1,980円（実用ノウハウ系の目安に近い）" },
  { value: 2480, label: "2,480円" },
  { value: 2980, label: "2,980円" },
  { value: 3480, label: "3,480円" },
  { value: 3980, label: "3,980円" },
  { value: 4980, label: "4,980円" },
  { value: 5980, label: "5,980円" },
  { value: 7980, label: "7,980円" },
  { value: 9800, label: "9,800円" },
  { value: 14800, label: "14,800円" },
  { value: 19800, label: "19,800円" },
  { value: 29800, label: "29,800円" },
  { value: 39800, label: "39,800円" },
  { value: 49800, label: "49,800円" },
] as const;

export function paidArticlePriceSelectionValue(price: number | null): string {
  if (price !== null && PAID_ARTICLE_PRICE_OPTIONS.some((option) => option.value === price)) {
    return String(price);
  }
  return "custom";
}

export const TARGET_LENGTH_OPTIONS = [
  { value: 800, label: "約800文字（かなり短め）" },
  { value: 1000, label: "約1,000文字（短め）" },
  { value: 1500, label: "約1,500文字" },
  { value: 2000, label: "約2,000文字" },
  { value: 3000, label: "約3,000文字" },
  { value: 4000, label: "約4,000文字" },
  { value: 5000, label: "約5,000文字（標準）" },
  { value: 6000, label: "約6,000文字" },
  { value: 8000, label: "約8,000文字（詳しく）" },
  { value: 10000, label: "約10,000文字（長め）" },
  { value: 12000, label: "約12,000文字" },
  { value: 15000, label: "約15,000文字（かなり詳しく）" },
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
