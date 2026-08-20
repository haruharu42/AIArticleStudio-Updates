from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v042"
CORE_NAMES = [
    "image_settings.py",
    "image_marker_parser.py",
    "image_prompt_builder.py",
    "image_assets.py",
    "gpu_diagnostic.py",
    "web_ai_state.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
]

APP_FIXTURE = '''import tkinter as tk\nfrom tkinter import ttk, messagebox\nBG="#0B1020"\nSURFACE="#111827"\nSURFACE_2="#151C2F"\nTEXT="#F8FAFC"\nSOFT="#CBD5E1"\nMUTED="#64748B"\nWEB_AI_URLS={"ChatGPT":"https://chatgpt.com"}\n# v0.4.0 Phase 3.5 integrated Web AI\nclass App(tk.Tk):\n    def __init__(self):\n        super().__init__()\n        self.vars={}\n        body=tk.Frame(self)\n        self.web_ai_bridge=None\n        # Basic settings\n    def card(self,*a,**k): return tk.Frame(self)\n    def _section_title(self,*a,**k): pass\n    def _label(self,*a,**k): return tk.Label(self)\n    def _secondary_button(self,*a,**k): return tk.Button(self)\n    def _primary_button(self,*a,**k): return tk.Button(self)\n    def _open_web_ai_site(self,*a,**k): pass\n    def _genre_changed(self, _event=None):\n        pass\n    def build(self, req):\n        _provider = "ChatGPT"\n        _quality = "標準"\n        _model = ""\n        _title_step = self.web_ai_bridge.build_title_step(req.__dict__, provider=_provider, quality=_quality, model_label=_model)\n        publish_links=tk.Frame(self)\n        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n'''


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = pathlib.Path(tmp)
        install = tmp_path / "AIArticleStudio"
        package = tmp_path / "package"
        app_dir = install / "src" / "ai_article_studio" / "ui"
        core_dir = install / "src" / "ai_article_studio" / "core"
        app_dir.mkdir(parents=True)
        core_dir.mkdir(parents=True)
        (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.1"\n', encoding="utf-8")
        (app_dir / "app.py").write_text(APP_FIXTURE, encoding="utf-8")
        # Preflight requires these existing v0.4.1 core names.
        for name in ("web_ai_workflow.py", "web_ai_ui_bridge.py", "web_prompt_engine_v2.py", "image_settings.py", "image_marker_parser.py"):
            source = ROOT / "src" / "ai_article_studio" / "core" / name
            shutil.copy2(source, core_dir / name)
        (package / "payload" / "core").mkdir(parents=True)
        for name in CORE_NAMES:
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, package / "payload" / "core" / name)

        run(str(RELEASE / "phase36_v042_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v042.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v042.py"), str(install))
        run(str(RELEASE / "validate_v042.py"), str(install))

        text = (app_dir / "app.py").read_text(encoding="utf-8")
        assert text.count("# v0.4.2 Phase 3.6 image workflow") == 1
        assert "画像生成設定" in text
        assert "画像プロンプト" in text
        compile(text, "app.py", "exec")

        # Applying patch twice must not duplicate UI.
        run(str(RELEASE / "patch_v042.py"), str(install), str(package))
        text2 = (app_dir / "app.py").read_text(encoding="utf-8")
        assert text2.count("# v0.4.2 Phase 3.6 image workflow") == 1

    print("V0.4.2 PATCH COMPATIBILITY TESTS OK")


if __name__ == "__main__":
    main()
