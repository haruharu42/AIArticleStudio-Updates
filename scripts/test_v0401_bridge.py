from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

from test_v040_patch_compat import fixture

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREFLIGHT = ROOT / "release" / "v0401" / "phase35_v0401_preflight.py"
PATCH = ROOT / "release" / "v040" / "patch_v040.py"
SET_VERSION = ROOT / "release" / "v0401" / "set_version_v0401.py"
VALIDATE = ROOT / "release" / "v0401" / "validate_v0401.py"
CORE_FILES = [
    "paid_value.py",
    "web_ai_config.py",
    "web_ai_ingest.py",
    "web_ai_prompt_builder.py",
    "web_ai_publish.py",
    "web_ai_repair.py",
    "web_ai_state.py",
    "web_ai_ui_bridge.py",
    "web_ai_workflow.py",
    "platform_content_strategy.py",
    "web_prompt_engine_v2.py",
]


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        base = pathlib.Path(tmp)
        root = base / "AIArticleStudio"
        app = root / "src" / "ai_article_studio" / "ui" / "app.py"
        init = root / "src" / "ai_article_studio" / "__init__.py"
        core = root / "src" / "ai_article_studio" / "core"
        backup_app = root / "backup_auto_20990101_000000" / "src" / "ai_article_studio" / "ui" / "app.py"
        package = base / "package"
        payload = package / "payload" / "core"

        app.parent.mkdir(parents=True)
        core.mkdir(parents=True)
        backup_app.parent.mkdir(parents=True)
        payload.mkdir(parents=True)

        app.write_text(fixture("0.3.9"), encoding="utf-8")
        backup_app.write_text(fixture("0.3.9"), encoding="utf-8")
        init.write_text('__version__ = "0.3.9"\n', encoding="utf-8")

        # The fixed preflight must ignore updater-created backup_auto_* trees.
        subprocess.run([sys.executable, str(PREFLIGHT), "--app-root", str(root)], check=True)

        for name in CORE_FILES:
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, payload / name)

        subprocess.run([sys.executable, str(PATCH), str(root), str(package)], check=True)
        subprocess.run([sys.executable, str(SET_VERSION), str(root)], check=True)
        subprocess.run([sys.executable, "-m", "compileall", "-q", str(root / "src" / "ai_article_studio")], check=True)
        subprocess.run([sys.executable, str(VALIDATE), str(root)], check=True)

        assert '__version__ = "0.4.0.1"' in init.read_text(encoding="utf-8")
        assert (core / "web_ai_workflow.py").is_file()
        assert (core / "web_prompt_engine_v2.py").is_file()
        assert app.read_text(encoding="utf-8").count("# v0.4.0 Phase 3.5 integrated Web AI") == 2

    subprocess.run([sys.executable, str(PREFLIGHT), "--self-test"], check=True)
    print("V0.4.0.1 BRIDGE TESTS OK")


if __name__ == "__main__":
    main()
