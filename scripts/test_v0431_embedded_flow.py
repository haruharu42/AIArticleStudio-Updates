from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0431"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.1_EmbeddedSixStepFlow.zip"


APP_FIXTURE = '''class App:
    # v0.4.3.1 insertion point
    # v0.4.2.9 live show_create activation hook
    def _v0429_activate_after_show_create(self):
        from .guided_wizard_v0429 import activate_live_article_wizard
        return activate_live_article_wizard(self)
'''


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_fixture(root: pathlib.Path) -> pathlib.Path:
    install = root / "AIArticleStudio"
    ui = install / "src" / "ai_article_studio" / "ui"
    ui.mkdir(parents=True)
    (install / "src" / "ai_article_studio" / "__init__.py").write_text('__version__ = "0.4.3.0"\n', encoding="utf-8")
    (ui / "app.py").write_text(APP_FIXTURE, encoding="utf-8")
    for number in (7, 8, 9):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / f"guided_wizard_v042{number}.py", ui)
    return install


def test_patch_and_validation() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_fixture(root)
        package = root / "package"
        payload = package / "payload" / "ui"
        payload.mkdir(parents=True)
        for name in ("guided_wizard_v0427.py", "guided_wizard_v0431.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload / name)
        run(str(RELEASE / "phase36_v0431_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0431.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v0431.py"), str(install))
        run(str(RELEASE / "validate_v0431.py"), str(install))
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        text = app.read_text(encoding="utf-8")
        assert text.count("# v0.4.3.1 embedded six-step creation flow") == 1
        assert text.count("from .guided_wizard_v0431 import activate_live_article_wizard") == 1
        before = text
        run(str(RELEASE / "patch_v0431.py"), str(install), str(package))
        assert app.read_text(encoding="utf-8") == before


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0431.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.1"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0431.json"))
    package = ROOT / "updates" / PACKAGE_NAME
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        assert "payload/ui/guided_wizard_v0431.py" in archive.namelist()
        assert "payload/ui/guided_wizard_v0427.py" in archive.namelist()
        assert "patch_v0431.py" in archive.namelist()


def main() -> None:
    test_patch_and_validation()
    test_package()
    print("V0.4.3.1 EMBEDDED FLOW PATCH AND PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
