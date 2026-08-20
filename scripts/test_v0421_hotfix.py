from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0421"

APP_FIXTURE = '''import tkinter as tk\nfrom tkinter import ttk, messagebox\nBG="#0B1020"\nSURFACE="#111827"\nSURFACE_2="#151C2F"\nTEXT="#F8FAFC"\nSOFT="#CBD5E1"\nMUTED="#64748B"\n# v0.4.0 Phase 3.5 integrated Web AI\nclass App(tk.Tk):\n    def __init__(self):\n        super().__init__()\n        self.vars={}\n    def card(self,*a,**k): return tk.Frame(self)\n    def _section_title(self,*a,**k): pass\n    def build(self):\n        body=tk.Frame(self)\n        self.web_settings_card = self.card(body, bg=SURFACE_2)\n        self._section_title(self.web_settings_card, "WEB", "Web版AIの設定", "")\n        # v0.4.2 Phase 3.6 image workflow\n        self.image_settings_card = self.card(body, bg=SURFACE_2)\n        self._section_title(self.image_settings_card, "IMAGE", "画像生成設定", "")\n        # Basic settings\n'''


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        install = pathlib.Path(tmp) / "AIArticleStudio"
        app_dir = install / "src" / "ai_article_studio" / "ui"
        core_dir = install / "src" / "ai_article_studio" / "core"
        app_dir.mkdir(parents=True)
        core_dir.mkdir(parents=True)
        (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.2"\n', encoding="utf-8")
        (app_dir / "app.py").write_text(APP_FIXTURE, encoding="utf-8")
        for name in ("web_ai_workflow.py", "web_ai_ui_bridge.py", "image_settings.py", "image_marker_parser.py", "image_prompt_builder.py"):
            source = ROOT / "src" / "ai_article_studio" / "core" / name
            shutil.copy2(source, core_dir / name)

        # A backup copy must not affect canonical-path preflight.
        backup_app = install / "backup_auto_20990101_000000" / "src" / "ai_article_studio" / "ui"
        backup_app.mkdir(parents=True)
        (backup_app / "app.py").write_text(APP_FIXTURE, encoding="utf-8")

        run(str(RELEASE / "phase36_v0421_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0421.py"), str(install))
        run(str(RELEASE / "set_version_v0421.py"), str(install))
        run(str(RELEASE / "validate_v0421.py"), str(install))

        text = (app_dir / "app.py").read_text(encoding="utf-8")
        assert text.count('self.image_settings_card.pack(fill="x", pady=(0,12))') == 1
        assert text.count('self.web_settings_card.pack(fill="x", pady=(0,12))') == 1
        compile(text, "app.py", "exec")

        # Patch is idempotent.
        run(str(RELEASE / "patch_v0421.py"), str(install))
        text2 = (app_dir / "app.py").read_text(encoding="utf-8")
        assert text2.count('self.image_settings_card.pack(fill="x", pady=(0,12))') == 1
        assert text2.count('self.web_settings_card.pack(fill="x", pady=(0,12))') == 1

    print("V0.4.2.1 HOTFIX TESTS OK")


if __name__ == "__main__":
    main()
