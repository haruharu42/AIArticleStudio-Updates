from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
RELEASE = ROOT / "release" / "v0432"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.2_MarkdownSafePublish.zip"
CORE_MODULES = ("article_publish_text.py", "web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py")


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_fixture(root: pathlib.Path, version: str) -> pathlib.Path:
    install = root / "AIArticleStudio"
    ui = install / "src" / "ai_article_studio" / "ui"
    core = ui.parent / "core"
    ui.mkdir(parents=True)
    core.mkdir(parents=True)
    (install / "src" / "ai_article_studio" / "__init__.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
    hook = "v0431" if version == "0.4.3.1" else "v0429"
    old_marker = "    # v0.4.3.1 embedded six-step creation flow\n" if version == "0.4.3.1" else ""
    app = (
        "class App:\n"
        f"{old_marker}"
        "    # v0.4.2.9 live show_create activation hook\n"
        "    def _v0429_activate_after_show_create(self):\n"
        f"        from .guided_wizard_{hook} import activate_live_article_wizard\n"
        "        return activate_live_article_wizard(self)\n"
    )
    (ui / "app.py").write_text(app, encoding="utf-8")
    for number in (7, 8, 9):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / f"guided_wizard_v042{number}.py", ui)
    if version == "0.4.3.1":
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0431.py", ui)
    for name in CORE_MODULES[1:]:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core / name)
    return install


def build_payload(package: pathlib.Path) -> None:
    ui = package / "payload" / "ui"
    core = package / "payload" / "core"
    ui.mkdir(parents=True)
    core.mkdir(parents=True)
    for name in ("guided_wizard_v0427.py", "guided_wizard_v0432.py"):
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, ui / name)
    for name in CORE_MODULES:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, core / name)


def test_patch(version: str) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_fixture(root, version)
        package = root / "package"
        build_payload(package)
        run(str(RELEASE / "phase36_v0432_preflight.py"), "--app-root", str(install))
        run(str(RELEASE / "patch_v0432.py"), str(install), str(package))
        run(str(RELEASE / "set_version_v0432.py"), str(install))
        run(str(RELEASE / "validate_v0432.py"), str(install))
        app = install / "src" / "ai_article_studio" / "ui" / "app.py"
        text = app.read_text(encoding="utf-8")
        assert text.count("# v0.4.3.2 embedded six-step creation flow") == 1
        assert text.count("from .guided_wizard_v0432 import activate_live_article_wizard") == 1
        before = text
        run(str(RELEASE / "patch_v0432.py"), str(install), str(package))
        assert app.read_text(encoding="utf-8") == before


def test_package() -> None:
    run(str(RELEASE / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0432.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.2"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0432.json"))
    with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
        assert archive.testzip() is None
        for name in CORE_MODULES:
            assert f"payload/core/{name}" in archive.namelist()
        assert "payload/ui/guided_wizard_v0432.py" in archive.namelist()


def main() -> None:
    for version in ("0.4.2.9", "0.4.3.0", "0.4.3.1"):
        test_patch(version)
    test_package()
    print("V0.4.3.2 UPDATE PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
