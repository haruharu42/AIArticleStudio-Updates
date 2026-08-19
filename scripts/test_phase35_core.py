from __future__ import annotations

import json
import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.web_ai_config import (  # noqa: E402
    QUALITY_UI_TO_ID,
    WebAIModelConfig,
    _validate,
)
from ai_article_studio.core.web_ai_prompt_builder import (  # noqa: E402
    WebAIContext,
    build_final_article_prompt,
    build_repair_prompt,
    build_title_prompt,
)


def check_model_config() -> None:
    payload = json.loads((ROOT / "config" / "web_ai_models.json").read_text(encoding="utf-8"))
    payload = _validate(payload)
    cfg = WebAIModelConfig(payload, "test", payload.get("config_version", ""))

    assert cfg.default_label("ChatGPT", "速さ優先") == "GPT-5.5 Instant"
    assert cfg.default_label("ChatGPT", "標準") == "GPT-5.6 Sol（Medium）"
    assert cfg.default_label("ChatGPT", "高品質") == "GPT-5.6 Sol（High）"
    assert cfg.quality_for_label("ChatGPT", "GPT-5.6 Sol（High）") == "高品質"
    assert "Terra" not in " ".join(cfg.labels("ChatGPT"))
    assert "Luna" not in " ".join(cfg.labels("ChatGPT"))
    assert "Sol Pro" not in " ".join(cfg.labels("ChatGPT"))
    assert set(QUALITY_UI_TO_ID) == {"速さ優先", "標準", "高品質"}


def sample_request(article_type: str = "有料") -> dict:
    return {
        "platform": "note",
        "genre": "AI副業",
        "subgenre": "AIおまかせ",
        "target_age": "30代",
        "target_gender": "指定なし",
        "article_type": article_type,
        "length_mode": "標準",
        "writing_style": "初心者向け",
        "angle": "実践・ハウツー",
        "price": "980",
        "experience_text": "",
    }


def check_prompts() -> None:
    ctx = WebAIContext(provider="ChatGPT", quality="高品質", model_label="GPT-5.6 Sol（High）")
    title = build_title_prompt(sample_request(), ctx)
    assert "タイトル候補を5件" in title
    assert "実体験の入力なし" in title
    assert "前置き・解説・評価コメントは不要" in title

    article = build_final_article_prompt(sample_request(), "AI副業を始めるための実践ガイド", ctx)
    assert "🔒 ここから有料" in article
    assert "## 🎁 特典" in article
    assert "実体験の入力なし" in article

    free_article = build_final_article_prompt(sample_request("無料"), "無料記事の例", ctx)
    assert "🔒 ここから有料" not in free_article

    repair = build_repair_prompt("本文", "missing_cta", sample_request(), ctx)
    assert "全文を作り直さず" in repair
    assert "CTA" in repair


def main() -> None:
    check_model_config()
    check_prompts()
    print("PHASE 3.5 CORE TESTS OK")


if __name__ == "__main__":
    main()
