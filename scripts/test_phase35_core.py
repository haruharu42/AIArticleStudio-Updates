from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.paid_value import (  # noqa: E402
    build_paid_value_profile,
    paid_value_prompt_lines,
)
from ai_article_studio.core.web_ai_config import (  # noqa: E402
    QUALITY_UI_TO_ID,
    WebAIModelConfig,
    _validate,
)
from ai_article_studio.core.web_ai_ingest import (  # noqa: E402
    ingest_web_ai_output,
    recommended_repair_types,
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


def sample_request(article_type: str = "有料", genre: str = "AI副業", price: str = "980") -> dict:
    return {
        "platform": "note",
        "genre": genre,
        "subgenre": "AIおまかせ",
        "target_age": "30代",
        "target_gender": "指定なし",
        "article_type": article_type,
        "length_mode": "標準",
        "writing_style": "初心者向け",
        "angle": "実践・ハウツー",
        "price": price,
        "experience_text": "",
        "bonus_enabled": True,
        "bonus_mode": "auto",
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


def check_paid_value() -> None:
    free_profile = build_paid_value_profile(sample_request("無料"))
    assert free_profile.enabled is False
    assert not free_profile.actionable_outputs

    low = build_paid_value_profile(sample_request(price="300"))
    assert low.enabled is True
    assert low.price_jpy == 300
    assert len(low.actionable_outputs) == 1
    assert low.value_elements[0] in {"practical_steps", "copy_paste_prompt", "checklist", "template", "roadmap"}
    assert "primary_experience" not in low.value_elements

    standard = build_paid_value_profile(sample_request(price="980"))
    assert len(standard.actionable_outputs) == 2
    assert len(standard.bonus_items) <= 1
    assert len(standard.actionable_outputs) <= 3
    assert any("成果を保証しない" in warning for warning in standard.warnings)

    high = build_paid_value_profile(sample_request(price="2980"))
    assert len(high.actionable_outputs) == 3
    assert high.price_fit == "good"

    gadget = build_paid_value_profile(sample_request(genre="ガジェット・PC・デジタル", price="980"))
    assert gadget.value_elements[:2] == ["comparison", "decision_framework"]
    assert any("価格・在庫・評価" in warning for warning in gadget.warnings)

    deduped = build_paid_value_profile(sample_request(price="980"), existing_output_types=["practical_steps", "copy_paste_prompt"])
    assert "practical_steps" not in deduped.value_elements
    assert "copy_paste_prompt" not in deduped.value_elements

    text = "\n".join(paid_value_prompt_lines(standard))
    assert "名前だけでなく中身まで生成" in text
    assert "文字数だけを増やさない" in text


def check_web_ai_ingest() -> None:
    raw = """```markdown
以下が記事です。
# AI副業を始めるための実践ガイド

## はじめに
初心者向けの本文です。

🔒 ここから有料

## STEP 1 準備
具体的な手順です。

## 🎁 特典：開始前チェックリスト
- 環境を確認する
- 目的を決める
- 作業時間を確保する
- 出力先を決める
- 公開前に見直す

## まとめ
まずは小さく実践してみてください。
```"""
    result = ingest_web_ai_output(raw, expect_paid=True)
    assert result.raw_web_output == raw
    assert result.normalized_output != raw
    assert result.code_fence_removed is True
    assert result.removed_wrappers == ["以下が記事です。"]
    assert result.title_detected == "AI副業を始めるための実践ガイド"
    assert result.paid_boundary_detected is True
    assert result.bonus_headings
    assert "checklist" in result.actionable_outputs_detected
    assert "practical_steps" in result.actionable_outputs_detected
    assert result.summary_detected is True
    assert result.cta_detected is True
    assert not recommended_repair_types(result)

    missing = ingest_web_ai_output("# タイトル\n\n本文だけです。", expect_paid=True)
    assert "missing_paid_boundary" in missing.warnings
    assert "missing_bonus" in missing.warnings
    assert "missing_summary" in missing.warnings
    assert "missing_cta" in missing.warnings
    repairs = recommended_repair_types(missing)
    assert "missing_paid_boundary" in repairs
    assert "missing_bonus" in repairs
    assert "incomplete_article" in repairs
    assert "missing_cta" in repairs

    free = ingest_web_ai_output("# 無料記事\n\n## まとめ\n試してみてください。", expect_paid=False)
    assert free.paid_boundary_detected is False
    assert "unexpected_paid_boundary" not in free.warnings

    empty = ingest_web_ai_output("   ")
    assert empty.is_empty
    assert "empty_output" in empty.warnings


def main() -> None:
    check_model_config()
    check_prompts()
    check_paid_value()
    check_web_ai_ingest()
    print("PHASE 3.5 CORE TESTS OK")


if __name__ == "__main__":
    main()
