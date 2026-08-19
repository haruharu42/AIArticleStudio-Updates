from __future__ import annotations

import pathlib
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.web_ai_state import WebAIStateStore  # noqa: E402
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow  # noqa: E402


def request(article_type: str = "有料") -> dict:
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
        "bonus_enabled": True,
        "bonus_mode": "auto",
    }


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        store = WebAIStateStore(pathlib.Path(tmp) / "workflow.json")
        flow = WebAIWorkflow(store)

        title_prompt, state = flow.prepare_title_prompt(
            request(), provider="ChatGPT", quality="高品質", model_label="GPT-5.6 Sol（High）"
        )
        assert "タイトル候補を5件" in title_prompt
        assert state.current_step == "02"
        assert state.provider == "ChatGPT"

        final_prompt, state = flow.select_title(
            request(),
            "AI副業を始めるための実践ガイド",
            provider="ChatGPT",
            quality="高品質",
            model_label="GPT-5.6 Sol（High）",
            title_candidates=["候補1", "候補2", "候補3", "候補4", "候補5"],
            title_response_raw="1. 候補1",
            state=state,
        )
        assert state.current_step == "03"
        assert "有料価値設計" in final_prompt
        assert "名前だけでなく中身まで生成" in final_prompt

        raw = """# AI副業を始めるための実践ガイド

## はじめに
本文です。

🔒 ここから有料

## STEP 1 準備
手順です。

## 🎁 特典：チェックリスト
- 目的を決める
- 時間を決める
- 出力先を決める
- 見直す
- 公開する

## まとめ
まずは試してみてください。
"""
        result, issues, state = flow.ingest_article(raw, expect_paid=True, state=state)
        assert state.current_step == "04"
        assert result.raw_web_output == raw
        assert result.paid_boundary_detected is True
        assert not [x for x in issues if x.severity == "blocking"]

        state = flow.set_publish_text(result.normalized_output, platform="note", state=state)
        ready = flow.publish_readiness(platform="note", state=state)
        assert ready.can_publish is True
        assert ready.platform == "note"
        assert ready.actions[0].key == "copy_publish"
        assert any(a.key == "open_note" for a in ready.actions)

        completed = flow.mark_completed(state)
        assert completed.current_step == "05"
        assert completed.is_completed is True
        assert flow.state_store.load().can_resume is False

    print("PHASE 3.5 WORKFLOW TESTS OK")


if __name__ == "__main__":
    main()
