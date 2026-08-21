from __future__ import annotations

import pathlib
import sys
import tempfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.article_publish_text import build_article_text_variants  # noqa: E402
from ai_article_studio.core.web_ai_state import WebAIStateStore  # noqa: E402
from ai_article_studio.core.web_ai_ui_bridge import WebAIUIBridge  # noqa: E402
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow  # noqa: E402
from ai_article_studio.core.image_prompt_builder import build_image_prompt_bundle  # noqa: E402


ARTICLE = """# 60代からのデジタル入門

## 判断表

| 優先順位 | したいこと | 使用頻度 | できないと困るか |
| ---- | ----- | ---- | -------- |
| 1 | 家族との連絡 | 毎日 | はい |

[挿絵1｜判断表の後｜目的から候補を絞る流れ]

## まとめ

まず目的を決めてください。

## 【挿絵一覧】

- 挿絵1｜判断表の後｜目的から候補を絞る流れ
"""


def request() -> dict:
    return {
        "platform": "note",
        "article_type": "無料",
        "genre": "ガジェット・PC・デジタル",
        "subgenre": "ガジェット紹介",
        "target_age": "60代以上",
    }


def main() -> None:
    variants = build_article_text_variants(ARTICLE)
    table = """| 優先順位 | したいこと | 使用頻度 | できないと困るか |
| ---- | ----- | ---- | -------- |
| 1 | 家族との連絡 | 毎日 | はい |"""
    assert variants.source_text == ARTICLE.strip()
    assert table in variants.insertion_text
    assert table in variants.publish_text
    assert "[挿絵1｜" in variants.insertion_text
    assert "[挿絵1｜" not in variants.publish_text
    assert "挿絵一覧" not in variants.insertion_text
    assert "挿絵一覧" not in variants.publish_text

    with tempfile.TemporaryDirectory() as tmp:
        store = WebAIStateStore(pathlib.Path(tmp) / "workflow.json")
        ui = WebAIUIBridge(WebAIWorkflow(store))
        state = store.start_new(generation_method="web")
        state.article_request = request()
        state.selected_title = "60代からのデジタル入門"
        store.save(state)
        result = ui.ingest_step(ARTICLE, expect_paid=False)
        published = ui.publish_step(result["normalized_output"], platform="note")
        snapshot = ui.current_snapshot()
        assert published["source_text"] == ARTICLE.strip()
        assert published["insertion_text"] == variants.insertion_text
        assert published["publish_text"] == variants.publish_text
        assert snapshot["normalized_output"] == ARTICLE.strip()
        assert snapshot["formatted_output"] == variants.publish_text

        ui.set_image_settings({"enabled": True, "target": "both", "style": "anime", "illustration_count": "1"})
        bundle = ui.build_image_prompts(article_text=published["insertion_text"])
        prompt = bundle["illustration_prompts"][0]["prompt"]
        for token in ("2Dアニメ素材", "光沢の強いアプリアイコン", "発光するバブルUI"):
            assert token in prompt, token

    module = (ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0432.py").read_text(encoding="utf-8")
    for token in ("v0.4.3.2-publish-safe-copy", "掲載用をコピー", "画像差し込み用", "元記事", "v0432_marker"):
        assert token in module, token
    print("V0.4.3.2 PUBLISH COPY TESTS OK")


if __name__ == "__main__":
    main()
