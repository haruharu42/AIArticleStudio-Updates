from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
RELEASE = ROOT / "release" / "v0425"

from ai_article_studio.core.web_ai_state import WebAIStateStore, WebAIWorkflowState  # noqa: E402
from ai_article_studio.core.web_ai_ui_bridge import WebAIUIBridge  # noqa: E402
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow  # noqa: E402


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def test_recent_history() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        store = WebAIStateStore(root / "current.json", history_path=root / "history.json", history_limit=10)
        ids = []
        for index in range(12):
            state = WebAIWorkflowState(
                article_id=f"article-{index}",
                current_step="04",
                selected_title=f"記事 {index}",
                article_request={"platform": "note", "genre": "AI副業"},
                raw_web_output=f"本文 {index}",
            )
            store.save(state)
            ids.append(state.article_id)
        recent = store.recent_summaries()
        assert len(recent) == 10
        assert recent[0]["article_id"] == "article-11"
        assert recent[-1]["article_id"] == "article-2"
        assert recent[0]["title"] == "記事 11"
        assert recent[0]["status"] == "作成中"

        loaded = store.load_history("article-5")
        assert loaded is not None and loaded.raw_web_output == "本文 5"
        assert store.recent_summaries()[0]["article_id"] == "article-5"

        fresh = store.start_new()
        assert fresh.article_id and fresh.article_id != "article-5"
        assert fresh.raw_web_output == ""
        assert store.load().article_id == fresh.article_id
        assert any(item["article_id"] == "article-5" for item in store.recent_summaries())


def test_clear_and_bridge() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        store = WebAIStateStore(root / "current.json", history_path=root / "history.json")
        state = WebAIWorkflowState(
            article_id="clear-me",
            current_step="04",
            selected_title="残すタイトル",
            raw_web_output="元本文",
            normalized_output="正規化本文",
            formatted_output="掲載本文",
        )
        store.save(state)
        cleared = store.clear_article_content()
        assert cleared.selected_title == "残すタイトル"
        assert cleared.raw_web_output == ""
        assert cleared.normalized_output == ""
        assert cleared.formatted_output == ""
        assert cleared.current_step == "03"

        bridge = WebAIUIBridge(WebAIWorkflow(state_store=store))
        bridge.save_editor_draft(raw_text="貼り付け直し", formatted_text="")
        assert bridge.current_snapshot()["raw_web_output"] == "貼り付け直し"
        assert bridge.current_snapshot()["formatted_output"] == ""
        assert bridge.history_items(10)[0]["title"] == "残すタイトル"
        new_snapshot = bridge.new_article()
        assert new_snapshot["raw_web_output"] == ""


def build_v0424_fixture(install: pathlib.Path, package22: pathlib.Path, package24: pathlib.Path) -> None:
    fixture_ns = runpy.run_path(str(ROOT / "scripts" / "test_v0422_image_linkage.py"))
    fixture = fixture_ns["APP_FIXTURE"]
    modal_anchor = "        win=tk.Toplevel(self)\n"
    prompt_fixture = '''        paste_titles=tk.Text(win)\n        article_prompt_text={"value":""}\n        selected_title=tk.StringVar(value="")\n        def choose_candidate(title: str):\n            _article_step = self.web_ai_bridge.build_article_step(\n                req.__dict__, title, provider="ChatGPT", quality="標準", model_label="test",\n                title_candidates=[], title_response_raw="",\n            )\n            article_prompt_text["value"] = _article_step["prompt"]\n'''
    fixture = fixture.replace(modal_anchor, modal_anchor + prompt_fixture, 1)
    fixture = fixture.replace(
        '        self._secondary_button(publish_links,"Brain",lambda:None).pack(side="left",padx=4)\n',
        '        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n',
        1,
    )
    app_dir = install / "src" / "ai_article_studio" / "ui"
    core_dir = install / "src" / "ai_article_studio" / "core"
    payload22 = package22 / "payload" / "core"
    payload24 = package24 / "payload" / "core"
    app_dir.mkdir(parents=True)
    core_dir.mkdir(parents=True)
    payload22.mkdir(parents=True)
    payload24.mkdir(parents=True)
    init = install / "src" / "ai_article_studio" / "__init__.py"
    init.write_text('__version__ = "0.4.2.1"\n', encoding="utf-8")
    (app_dir / "app.py").write_text(fixture, encoding="utf-8")
    for name in ("image_settings.py", "image_prompt_builder.py", "web_ai_workflow.py", "web_ai_ui_bridge.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload22 / name)
    for name in ("image_settings.py", "image_prompt_builder.py", "web_prompt_engine_v2.py", "web_ai_workflow.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload24 / name)
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)
    for name in ("web_ai_state.py", "web_ai_ui_bridge.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)
    run(str(ROOT / "release" / "v0422" / "patch_v0422.py"), str(install), str(package22))
    init.write_text('__version__ = "0.4.2.3"\n', encoding="utf-8")
    run(str(ROOT / "release" / "v0424" / "patch_v0424.py"), str(install), str(package24))
    run(str(ROOT / "release" / "v0424" / "set_version_v0424.py"), str(install))


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = root / "AIArticleStudio"
        package22 = root / "package22"
        package24 = root / "package24"
        package25 = root / "package25"
        payload25 = package25 / "payload" / "core"
        payload25.mkdir(parents=True)
        build_v0424_fixture(install, package22, package24)
        for name in ("web_ai_state.py", "web_ai_ui_bridge.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload25 / name)

        run(str(RELEASE / "phase36_v0425_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0425.py"), str(install), str(package25))
        run(str(RELEASE / "set_version_v0425.py"), str(install))
        run(str(RELEASE / "validate_v0425.py"), str(install))

        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        text = app.read_text(encoding="utf-8")
        compile(text, str(app), "exec")
        assert text.count("# v0.4.2.5 guided article wizard and recent history") == 1
        assert "STEP {index + 1}/{len(pages)}" in text
        assert "最近の作業（最大10件）" in text
        assert "貼り付け欄をクリア" in text
        assert "新しい記事" in text
        assert text.count("self._install_create_step_wizard(body)") == 1
        assert text.count("self._install_web_ai_article_wizard(") == 1
        before = text
        run(str(RELEASE / "patch_v0425.py"), str(install), str(package25))
        assert app.read_text(encoding="utf-8") == before


def main() -> None:
    test_recent_history()
    test_clear_and_bridge()
    test_patch()
    print("V0.4.2.5 GUIDED WIZARD AND HISTORY TESTS OK")


if __name__ == "__main__":
    main()
