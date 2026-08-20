from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0428"


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def build_v0427_fixture(root: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    prior = runpy.run_path(str(ROOT / "scripts" / "test_v0426_embedded_wizard.py"))
    install, package26 = prior["build_v0425_fixture"](root)
    package26.mkdir(parents=True, exist_ok=True)
    run(str(ROOT / "release" / "v0426" / "patch_v0426.py"), str(install), str(package26))
    run(str(ROOT / "release" / "v0426" / "set_version_v0426.py"), str(install))
    package27 = root / "package27"
    payload27 = package27 / "payload" / "ui"
    payload27.mkdir(parents=True)
    shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0427.py", payload27 / "guided_wizard_v0427.py")
    run(str(ROOT / "release" / "v0427" / "patch_v0427.py"), str(install), str(package27))
    run(str(ROOT / "release" / "v0427" / "set_version_v0427.py"), str(install))
    return install, root / "package28"


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install, package28 = build_v0427_fixture(root)
        payload = package28 / "payload" / "ui"
        payload.mkdir(parents=True)
        for name in ("guided_wizard_v0427.py", "guided_wizard_v0428.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload / name)
        run(str(RELEASE / "phase36_v0428_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0428.py"), str(install), str(package28))
        run(str(RELEASE / "set_version_v0428.py"), str(install))
        run(str(RELEASE / "validate_v0428.py"), str(install))
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        text = app.read_text(encoding="utf-8")
        assert text.count("# v0.4.2.8 direct visual wizard activation") == 1
        assert "install_visual_article_wizard(self, body)" in text
        assert "install_visual_web_ai_wizard(\n            self,\n            win," in text
        assert "        self._install_single_item_article_wizard(body)\n" not in text
        assert "        self._install_web_ai_article_wizard(\n            win,\n" not in text
        applied = text
        run(str(RELEASE / "patch_v0428.py"), str(install), str(package28))
        assert app.read_text(encoding="utf-8") == applied


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    package = ROOT / "updates" / "AIArticleStudio_Update_v0.4.2.8_DirectVisualWizard.zip"
    assert package.is_file()
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        assert "payload/ui/guided_wizard_v0427.py" in archive.namelist()
        assert "payload/ui/guided_wizard_v0428.py" in archive.namelist()


def main() -> None:
    test_patch()
    test_package()
    print("V0.4.2.8 DIRECT VISUAL WIZARD PATCH TESTS OK")


if __name__ == "__main__":
    main()
