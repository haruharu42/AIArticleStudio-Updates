from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any
import uuid

PLATFORMS = ["note", "Tips", "Brain", "ブログ", "その他"]
GENRES = [
    "AI・生成AI", "AI副業", "副業・在宅ワーク", "note・コンテンツ販売",
    "SNS・情報発信", "YouTube・動画制作", "ビジネス・仕事術",
    "転職・キャリア", "恋愛・人間関係", "美容・自分磨き", "学習・資格",
    "子育て・教育", "節約・家計管理", "ライフスタイル・暮らし",
    "ガジェット・PC・デジタル", "趣味・エンタメ", "AIおまかせ", "自分で決める"
]
SUBGENRES = {
    "AI・生成AI": ["ChatGPT活用", "生成AI初心者", "AIツール比較", "プロンプト活用", "AI仕事効率化", "AIライティング", "AI画像生成", "AI動画生成", "AIエージェント", "AIニュース・トレンド", "AIおまかせ", "自分で決める"],
    "AI副業": ["AIライティング副業", "AI画像副業", "AI動画副業", "AIブログ", "AI記事販売", "AIアプリ制作", "AI自動化", "プロンプト活用", "AIコンテンツ販売", "AI副業初心者", "AI収益化", "AIおまかせ", "自分で決める"],
    "副業・在宅ワーク": ["Webライティング", "ブログ", "コンテンツ販売", "動画編集", "デザイン", "スキル販売", "在宅ワーク", "フリーランス", "副業初心者", "会社員副業", "時間管理", "AIおまかせ", "自分で決める"],
    "note・コンテンツ販売": ["note初心者", "無料記事", "有料記事", "有料記事の作り方", "タイトル", "文章構成", "集客", "販売導線", "コンテンツ設計", "Tips", "Brain", "シリーズ記事", "AIおまかせ", "自分で決める"],
    "SNS・情報発信": ["X", "Instagram", "TikTok", "Threads", "SNS初心者", "投稿作成", "フォロワー獲得", "SNS集客", "ブランディング", "SNS収益化", "コンテンツ企画", "AIおまかせ", "自分で決める"],
    "YouTube・動画制作": ["YouTube初心者", "Shorts", "長尺動画", "チャンネル運営", "台本作成", "サムネイル", "動画編集", "AI動画制作", "YouTube収益化", "再生数改善", "ネタ・企画", "AIおまかせ", "自分で決める"],
    "ビジネス・仕事術": ["仕事効率化", "生産性", "時間管理", "営業", "マーケティング", "プレゼン", "マネジメント", "リモートワーク", "タスク管理", "AI仕事活用", "キャリアアップ", "AIおまかせ", "自分で決める"],
    "転職・キャリア": ["転職活動", "キャリア形成", "面接", "履歴書・職務経歴書", "スキルアップ", "仕事の悩み", "退職", "未経験転職", "会社員副業", "フリーランス", "働き方", "AIおまかせ", "自分で決める"],
    "恋愛・人間関係": ["片思い", "恋愛初心者", "マッチングアプリ", "婚活", "復縁", "夫婦関係", "恋人との関係", "職場の人間関係", "友人関係", "コミュニケーション", "自己改善", "AIおまかせ", "自分で決める"],
    "美容・自分磨き": ["スキンケア", "メイク", "ヘアケア", "メンズ美容", "コスメ", "美容習慣", "エイジングケア", "ファッション", "身だしなみ", "自分磨き", "AIおまかせ", "自分で決める"],
    "学習・資格": ["資格勉強", "勉強法", "英語", "語学", "社会人学習", "AI学習", "読書", "暗記", "時間管理", "モチベーション", "スキル習得", "AIおまかせ", "自分で決める"],
    "子育て・教育": ["幼児教育", "小学生", "中学生", "高校生", "家庭学習", "勉強習慣", "子育ての悩み", "親子コミュニケーション", "時短", "教育ツール", "AI教育活用", "AIおまかせ", "自分で決める"],
    "節約・家計管理": ["節約", "家計管理", "固定費", "貯金", "ポイ活", "お得情報", "生活費", "サブスク整理", "買い物術", "家計簿", "AIおまかせ", "自分で決める"],
    "ライフスタイル・暮らし": ["時短", "習慣", "整理整頓", "ミニマリスト", "暮らし改善", "家事", "生活効率化", "趣味", "自己改善", "生活便利術", "AIおまかせ", "自分で決める"],
    "ガジェット・PC・デジタル": ["パソコン", "スマートフォン", "PC周辺機器", "AI対応PC", "ガジェット紹介", "アプリ", "ソフトウェア", "作業環境", "デスク環境", "初心者向けIT", "製品比較", "AIおまかせ", "自分で決める"],
    "趣味・エンタメ": ["ゲーム", "アニメ", "映画", "ドラマ", "音楽", "読書", "VTuber", "推し活", "旅行体験", "趣味紹介", "AIおまかせ", "自分で決める"],
    "AIおまかせ": ["AIおまかせ"],
    "自分で決める": ["自分で決める"],
}

@dataclass
class ArticleRequest:
    platform: str = "note"
    genre: str = "AI副業"
    subgenre: str = "AIおまかせ"
    target_age: str = "30代"
    target_gender: str = "指定なし"
    article_type: str = "無料"
    price_jpy: int | None = None
    length_mode: str = "AIおまかせ"
    tone: str = "AIおまかせ"
    angle: str = "AIおまかせ"
    decoration_mode: str = "AIおまかせ"
    naturalness_mode: str = "AIおまかせ"
    ai_quality_mode: str = "AIおまかせ"
    trend_mode: str = "AIおまかせ"
    competitor_mode: str = "AIおまかせ"
    originality_mode: str = "高め"
    user_experience: str = ""
    custom_request: str = ""
    generation_provider: str = "AIおまかせ"
    bonus_enabled: bool = False
    bonus_items: list[str] = field(default_factory=list)
    affiliate_enabled: bool = False
    affiliate_items: list[dict[str, Any]] = field(default_factory=list)
    web_ai_service: str = "ChatGPT"
    web_ai_quality: str = "標準"
    web_ai_model: str = ""

    def validate(self) -> list[str]:
        errors: list[str] = []
        if not self.platform:
            errors.append("掲載先を選択してください。")
        if not self.genre:
            errors.append("ジャンルを選択してください。")
        if not self.article_type:
            errors.append("無料/有料を選択してください。")
        if self.article_type == "有料" and (self.price_jpy is None or self.price_jpy <= 0):
            errors.append("有料記事は販売価格を設定してください。")
        if self.affiliate_enabled:
            valid_items = [x for x in self.affiliate_items if str(x.get("name", "")).strip() and str(x.get("url", "")).strip()]
            if not valid_items:
                errors.append("アフィリエイトを使用する場合は、商品・サービス名とアフィリエイトURLを入力してください。")
        return errors

@dataclass
class ArticleRecord:
    article_id: str = field(default_factory=lambda: f"article_{uuid.uuid4().hex[:12]}")
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: str = "draft"
    title: str = ""
    theme: str = ""
    request: dict[str, Any] = field(default_factory=dict)
    theme_result: dict[str, Any] = field(default_factory=dict)
    research_brief: dict[str, Any] = field(default_factory=dict)
    article_plan: dict[str, Any] = field(default_factory=dict)
    outline: dict[str, Any] = field(default_factory=dict)
    content: dict[str, Any] = field(default_factory=dict)
    final_audit_report: dict[str, Any] = field(default_factory=dict)
    cost_estimate: dict[str, Any] = field(default_factory=dict)
    cost_actual: dict[str, Any] = field(default_factory=dict)
    generation_checkpoint: dict[str, Any] = field(default_factory=dict)
    generation_history: list[dict[str, Any]] = field(default_factory=list)
    revision_history: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
