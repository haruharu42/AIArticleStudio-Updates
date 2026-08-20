from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.platform_content_strategy import get_platform_strategy  # noqa: E402
from ai_article_studio.core.web_ai_prompt_builder import WebAIContext  # noqa: E402
from ai_article_studio.core.web_prompt_engine_v2 import (  # noqa: E402
    build_final_article_prompt_v2,
    build_title_prompt_v2,
    illustration_options,
)


def req(platform: str = "note", article_type: str = "有料", illustrations: bool = True) -> dict:
    return {
        "platform": platform,
        "article_type": article_type,
        "genre": "AI副業",
        "subgenre": "AIおまかせ",
        "target_age": "30代",
        "target_gender": "指定なし",
        "reader_level": "初心者",
        "reader_problem": "何から始めればよいか分からない",
        "reader_outcome": "最初の一歩を具体化できる",
        "length_mode": "標準",
        "writing_style": "初心者向け",
        "angle": "実践・ハウツー",
        "price": "980",
        "experience_text": "",
        "illustration_enabled": illustrations,
        "illustration_count": "自動",
        "illustration_style": "図解風",
    }


def main() -> None:
    ctx = WebAIContext(provider="ChatGPT", quality="高品質", model_label="GPT-5.6 Sol（High）")

    title = build_title_prompt_v2(req(), ctx)
    assert "タイトル候補を5件" in title
    assert "ARTICLE BRIEF" in title
    assert "note向けタイトル方針" in title
    assert "実績" in title

    final = build_final_article_prompt_v2(req(), "AI副業を始めるための実践ガイド", ctx)
    assert "note向け編集戦略" in final
    assert "挿絵モジュール" in final
    assert "[挿絵1｜導入の後｜記事全体を理解するためのイメージ]" in final
    assert "画像生成用の長いプロンプトは本文に書かない" in final
    assert "【挿絵一覧】" in final
    assert "チェック過程は出力せず" in final

    no_image = build_final_article_prompt_v2(req(illustrations=False), "テスト", ctx)
    assert "挿絵モジュール" not in no_image
    assert "【挿絵一覧】" not in no_image

    free = build_final_article_prompt_v2(req(article_type="無料"), "テスト", ctx)
    assert "無料記事ルール" in free
    assert "有料境界は入れない" in free

    tips = build_final_article_prompt_v2(req(platform="Tips"), "テスト", ctx)
    brain = build_final_article_prompt_v2(req(platform="Brain"), "テスト", ctx)
    assert "Tips向け編集戦略" in tips
    assert "時間短縮" in tips
    assert "Brain向け編集戦略" in brain
    assert "体系化" in brain

    assert get_platform_strategy("note").key == "note"
    assert get_platform_strategy("Tips").key == "Tips"
    assert get_platform_strategy("Brain").key == "Brain"
    assert illustration_options(req()).enabled is True
    assert illustration_options(req(illustrations=False)).enabled is False

    print("WEB PROMPT ENGINE V2 TESTS OK")


if __name__ == "__main__":
    main()
