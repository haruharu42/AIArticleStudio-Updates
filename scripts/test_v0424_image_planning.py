from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
RELEASE = ROOT / "release" / "v0424"

from ai_article_studio.core.image_prompt_builder import build_image_prompt_bundle  # noqa: E402
from ai_article_studio.core.image_settings import normalize_image_settings  # noqa: E402
from ai_article_studio.core.web_ai_prompt_builder import WebAIContext  # noqa: E402
from ai_article_studio.core.web_prompt_engine_v2 import build_final_article_prompt_v2  # noqa: E402


def request() -> dict:
    return {
        "platform": "note",
        "article_type": "無料",
        "genre": "ガジェット・PC・デジタル",
        "subgenre": "ガジェット紹介",
        "reader_level": "初心者",
        "target_age": "60代以上",
        "reader_problem": "機能が多すぎて選べない",
    }


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def test_four_states() -> None:
    ctx = WebAIContext(provider="ChatGPT", quality="標準", model_label="test")
    cases = (
        (False, "both", False, False),
        (True, "eyecatch", False, True),
        (True, "illustrations", True, False),
        (True, "both", True, True),
    )
    article = "# 入門\n\n## 選び方\n本文です。\n"
    for enabled, target, has_markers, has_eye in cases:
        settings = normalize_image_settings({
            "enabled": enabled,
            "target": target,
            "illustration_count": "auto",
        })
        req = request()
        req["illustration_enabled"] = enabled and target in {"illustrations", "both"}
        req["illustration_count"] = "自動"
        prompt = build_final_article_prompt_v2(req, "60代からのガジェット選び", ctx)
        assert ("【挿絵モジュール】" in prompt) is has_markers
        bundle = build_image_prompt_bundle(req, "60代からのガジェット選び", article, settings)
        assert bool(bundle.eyecatch_prompt) is has_eye
        assert bool(bundle.illustration_prompts) is has_markers


def test_auto_count_and_manual_range() -> None:
    headings = []
    for index in range(1, 9):
        headings.append(f"## 重要ポイント{index}\n" + ("具体的な本文です。" * 190))
    article = "# 長い記事\n\n" + "\n\n".join(headings) + "\n\n## まとめ\n要点です。\n"
    auto = normalize_image_settings({"enabled": True, "target": "illustrations", "illustration_count": "auto"})
    bundle = build_image_prompt_bundle(request(), "長い記事", article, auto)
    assert 4 <= len(bundle.illustration_prompts) <= 6
    assert all("まとめ" not in item["position"] for item in bundle.illustration_prompts)

    manual = normalize_image_settings({"enabled": True, "target": "illustrations", "illustration_count": "6"})
    assert manual.illustration_count == "6"
    manual_bundle = build_image_prompt_bundle(request(), "長い記事", article, manual)
    assert len(manual_bundle.illustration_prompts) == 6


def test_cross_platform_package_bytes() -> None:
    build_ns = runpy.run_path(str(RELEASE / "build_package.py"))
    canonical_bytes = build_ns["canonical_bytes"]
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        lf = root / "lf.py"
        crlf = root / "crlf.py"
        lf.write_bytes(b"first\nsecond\n")
        crlf.write_bytes(b"first\r\nsecond\r\n")
        assert canonical_bytes(lf) == canonical_bytes(crlf) == b"first\nsecond\n"


def test_patch() -> None:
    fixture_ns = runpy.run_path(str(ROOT / "scripts" / "test_v0422_image_linkage.py"))
    fixture = fixture_ns["APP_FIXTURE"]
    modal_anchor = "        win=tk.Toplevel(self)\n"
    prompt_fixture = '''        paste_titles=tk.Text(win)\n        article_prompt_text={"value":""}\n        def choose_candidate(title: str):\n            _article_step = self.web_ai_bridge.build_article_step(\n                req.__dict__, title, provider="ChatGPT", quality="標準", model_label="test",\n                title_candidates=[], title_response_raw="",\n            )\n            article_prompt_text["value"] = _article_step["prompt"]\n'''
    fixture = fixture.replace(modal_anchor, modal_anchor + prompt_fixture, 1)
    fixture = fixture.replace(
        '        self._secondary_button(publish_links,"Brain",lambda:None).pack(side="left",padx=4)\n',
        '        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n',
        1,
    )

    with tempfile.TemporaryDirectory() as tmp:
        install = pathlib.Path(tmp) / "AIArticleStudio"
        package22 = pathlib.Path(tmp) / "package22"
        package24 = pathlib.Path(tmp) / "package24"
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
        v0422_core = ("image_settings.py", "image_prompt_builder.py", "web_ai_workflow.py", "web_ai_ui_bridge.py")
        for name in v0422_core:
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload22 / name)
        for name in ("image_settings.py", "image_prompt_builder.py", "web_prompt_engine_v2.py", "web_ai_workflow.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload24 / name)
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core_dir / name)

        run(str(ROOT / "release" / "v0422" / "patch_v0422.py"), str(install), str(package22))
        init.write_text('__version__ = "0.4.2.3"\n', encoding="utf-8")
        run(str(RELEASE / "phase36_v0424_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0424.py"), str(install), str(package24))
        run(str(RELEASE / "set_version_v0424.py"), str(install))
        run(str(RELEASE / "validate_v0424.py"), str(install))

        text = (app_dir / "app.py").read_text(encoding="utf-8")
        compile(text, "app.py", "exec")
        assert text.count("# v0.4.2.4 pre-article image planning controls") == 1
        assert 'text="アイキャッチを作成（noteなどでは推奨）"' in text
        assert 'text="記事内の挿絵を作成"' in text
        assert 'values=["AIにおまかせ","1","2","3","4","5","6"]' in text
        assert 'linked_image_card=tk.Frame(step4' not in text
        assert text.count("self._sync_image_settings()\n            _article_step") == 1
        assert text.count('self._secondary_button(publish_links,"画像プロンプト"') == 1
        run(str(RELEASE / "patch_v0424.py"), str(install), str(package24))
        assert (app_dir / "app.py").read_text(encoding="utf-8") == text


def main() -> None:
    test_four_states()
    test_auto_count_and_manual_range()
    test_cross_platform_package_bytes()
    test_patch()
    print("V0.4.2.4 IMAGE PLANNING TESTS OK")


if __name__ == "__main__":
    main()
