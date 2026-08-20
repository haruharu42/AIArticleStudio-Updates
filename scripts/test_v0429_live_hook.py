from __future__ import annotations

import pathlib
import runpy
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0429"


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True)


def build_v0428_fixture(root: pathlib.Path) -> tuple[pathlib.Path, pathlib.Path]:
    prior = runpy.run_path(str(ROOT / "scripts" / "test_v0428_direct_visual_wizard.py"))
    install, package28 = prior["build_v0427_fixture"](root)
    payload28 = package28 / "payload" / "ui"
    payload28.mkdir(parents=True)
    for name in ("guided_wizard_v0427.py", "guided_wizard_v0428.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload28 / name)
    run(str(ROOT / "release" / "v0428" / "patch_v0428.py"), str(install), str(package28))
    run(str(ROOT / "release" / "v0428" / "set_version_v0428.py"), str(install))
    return install, root / "package29"


def test_patch() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install, package29 = build_v0428_fixture(root)
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        text = app.read_text(encoding="utf-8")
        anchor = "    # v0.4.2.8 direct visual wizard activation\n"
        assert anchor in text
        # Reproduce the real failure: the old end-of-builder call exists but is unreachable.
        text = text.replace(
            "        from .guided_wizard_v0428 import install_article_wizard as install_visual_article_wizard\n",
            "        return body\n        from .guided_wizard_v0428 import install_article_wizard as install_visual_article_wizard\n",
            1,
        )
        app.write_text(text, encoding="utf-8")
        payload = package29 / "payload" / "ui"
        payload.mkdir(parents=True)
        for name in ("guided_wizard_v0427.py", "guided_wizard_v0428.py", "guided_wizard_v0429.py"):
            shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload / name)
        run(str(RELEASE / "phase36_v0429_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0429.py"), str(install), str(package29))
        run(str(RELEASE / "set_version_v0429.py"), str(install))
        run(str(RELEASE / "validate_v0429.py"), str(install))
        applied = app.read_text(encoding="utf-8")
        assert applied.count("# v0.4.2.9 live show_create activation hook") == 1
        assert applied.find("_v0429_original_show_create = show_create") < applied.find(anchor)
        assert "self.after_idle(self._v0429_activate_after_show_create)" in applied
        run(str(RELEASE / "patch_v0429.py"), str(install), str(package29))
        assert app.read_text(encoding="utf-8") == applied


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    package = ROOT / "updates" / "AIArticleStudio_Update_v0.4.2.9_LiveArticleCreatorHook.zip"
    assert package.is_file()
    with zipfile.ZipFile(package) as archive:
        assert archive.testzip() is None
        assert "payload/ui/guided_wizard_v0429.py" in archive.namelist()


def main() -> None:
    test_patch()
    test_package()
    print("V0.4.2.9 LIVE SHOW_CREATE HOOK TESTS OK")


if __name__ == "__main__":
    main()
