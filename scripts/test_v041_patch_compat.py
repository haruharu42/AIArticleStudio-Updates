from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "updates" / "AIArticleStudio_Update_v0.4.1_WebPromptEngineV2.zip"


def main() -> None:
    if not PACKAGE.is_file():
        raise RuntimeError("v0.4.1 package missing")
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)
        package_root = base / "package"
        install = base / "install"
        with zipfile.ZipFile(PACKAGE) as z:
            z.extractall(package_root)

        core = install / "src" / "ai_article_studio" / "core"
        ui = install / "src" / "ai_article_studio" / "ui"
        core.mkdir(parents=True)
        ui.mkdir(parents=True)
        (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.0"\n', encoding="utf-8")
        (ui / "app.py").write_text('# v0.4.0 Phase 3.5 integrated Web AI\n# v0.4.0 Phase 3.5 integrated Web AI\n', encoding="utf-8")
        (core / "web_ai_workflow.py").write_text(
            "from .web_ai_prompt_builder import WebAIContext, build_final_article_prompt, build_title_prompt\n"
            "def a(request, ctx):\n    return build_title_prompt(request, ctx)\n"
            "def b(request, selected_title, ctx):\n    return build_final_article_prompt(request, selected_title, ctx)\n",
            encoding="utf-8",
        )
        (core / "web_ai_prompt_builder.py").write_text(
            "class WebAIContext:\n    def __init__(self, provider='ChatGPT', quality='標準', model_label=''):\n        self.provider=provider; self.quality=quality; self.model_label=model_label\n",
            encoding="utf-8",
        )

        subprocess.check_call([sys.executable, str(package_root / "patch_v041.py"), str(install), str(package_root)])
        subprocess.check_call([sys.executable, str(package_root / "validate_v041.py"), str(install)])
        workflow = (core / "web_ai_workflow.py").read_text(encoding="utf-8")
        assert "build_title_prompt_v2" in workflow
        assert "build_final_article_prompt_v2" in workflow
        assert (core / "web_prompt_engine_v2.py").is_file()
        assert (core / "platform_content_strategy.py").is_file()
        assert '__version__ = "0.4.1"' in (install / "src" / "ai_article_studio" / "__init__.py").read_text(encoding="utf-8")

        # Idempotency: applying the patch twice must not duplicate imports.
        subprocess.check_call([sys.executable, str(package_root / "patch_v041.py"), str(install), str(package_root)])
        workflow2 = (core / "web_ai_workflow.py").read_text(encoding="utf-8")
        assert workflow2.count("from .web_prompt_engine_v2 import") == 1

    print("V0.4.1 PATCH COMPATIBILITY TEST OK")


if __name__ == "__main__":
    main()
