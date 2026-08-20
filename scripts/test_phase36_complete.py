from __future__ import annotations

import json
import pathlib
import tempfile
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.gpu_diagnostic import diagnose_gpu  # noqa: E402
from ai_article_studio.core.image_assets import ArticleImageStore  # noqa: E402
from ai_article_studio.core.image_marker_parser import extract_markers  # noqa: E402
from ai_article_studio.core.image_prompt_builder import build_image_prompt_bundle  # noqa: E402
from ai_article_studio.core.image_settings import normalize_image_settings  # noqa: E402
from ai_article_studio.core.web_ai_state import WebAIStateStore, WebAIWorkflowState  # noqa: E402
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow  # noqa: E402


def request() -> dict:
    return {
        "platform": "note",
        "article_type": "無料",
        "genre": "AI副業",
        "subgenre": "AIおまかせ",
        "reader_level": "初心者",
        "target_age": "30代",
        "reader_problem": "何から始めればよいか分からない",
    }


def main() -> None:
    settings = normalize_image_settings({
        "enabled": True,
        "target": "both",
        "mode": "web",
        "style": "diagram",
        "illustration_count": "2",
    })
    article = """# AI副業入門\n\n導入です。\n\n[挿絵1｜導入の後｜全体像を理解するための図]\n\n## STEP1\n本文です。\n\n[挿絵2｜STEP1の後｜手順を整理する図解]\n"""
    markers = extract_markers(article)
    assert len(markers) == 2

    bundle = build_image_prompt_bundle(request(), "AI副業入門", article, settings)
    assert "アイキャッチ画像" in bundle.eyecatch_prompt
    assert len(bundle.illustration_prompts) == 2
    assert "挿絵1" in bundle.illustration_prompts[0]["label"]
    assert "【挿絵一覧】" in bundle.illustration_summary
    assert "実在しない成果" in bundle.illustration_prompts[0]["prompt"]

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        state_store = WebAIStateStore(root / "workflow.json")
        image_store = ArticleImageStore(root / "articles")
        workflow = WebAIWorkflow(state_store=state_store, image_store=image_store)
        state = WebAIWorkflowState(article_id="article-001")
        state_store.save(state)
        workflow.set_image_settings(settings.to_dict(), state=state)
        prompt, state = workflow.prepare_title_prompt(
            request(), provider="ChatGPT", quality="標準", model_label="test", state=state
        )
        assert "タイトル候補" in prompt
        final, state = workflow.select_title(
            request(), "AI副業入門", provider="ChatGPT", quality="標準", model_label="test", state=state
        )
        assert "挿絵モジュール" in final
        state.raw_web_output = article
        state.normalized_output = article
        state_store.save(state)
        payload = workflow.build_image_prompts(state=state)
        assert payload["generator_mode"] == "web"
        assert len(payload["illustration_prompts"]) == 2
        sidecar = image_store.metadata_path("article-001")
        assert sidecar.is_file()
        parsed = json.loads(sidecar.read_text(encoding="utf-8"))
        assert parsed["image_settings"]["enabled"] is True

        reloaded = state_store.load()
        assert reloaded is not None
        assert reloaded.schema_version == 2
        assert reloaded.image_settings["enabled"] is True
        assert reloaded.image_assets_meta["generator_mode"] == "web"

    gpu = diagnose_gpu(timeout_seconds=1.0)
    assert isinstance(gpu.available, bool)
    assert gpu.recommended_mode in {"web", "local_candidate"}
    assert gpu.message

    print("PHASE 3.6 COMPLETE CORE TESTS OK")


if __name__ == "__main__":
    main()
