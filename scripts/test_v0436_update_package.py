from __future__ import annotations

import json
import hashlib
import pathlib
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.6_AdminUserMode.zip"
V0435_PACKAGE = ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.5_AdminUserManagement.zip"

sys.path.insert(0, str(ROOT / "scripts"))
import test_v0434_update_package as v0434  # noqa: E402


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def build_v0435_fixture(root: pathlib.Path) -> pathlib.Path:
    install = v0434.build_v0433_fixture(root)
    old_v0434 = root / "v0434-package"
    with zipfile.ZipFile(ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.4_GoogleOAuthFix.zip") as archive:
        archive.extractall(old_v0434)
    run(str(old_v0434 / "phase36_v0434_preflight.py"), "--app-root", str(install))
    run(str(old_v0434 / "patch_v0434.py"), str(install), str(old_v0434))
    run(str(old_v0434 / "set_version_v0434.py"), str(install))
    run(str(old_v0434 / "validate_v0434.py"), str(install))

    old_v0435 = root / "v0435-package"
    with zipfile.ZipFile(V0435_PACKAGE) as archive:
        archive.extractall(old_v0435)
    run(str(old_v0435 / "phase36_v0435_preflight.py"), "--app-root", str(install))
    run(str(old_v0435 / "patch_v0435.py"), str(install), str(old_v0435))
    run(str(old_v0435 / "set_version_v0435.py"), str(install))
    run(str(old_v0435 / "validate_v0435.py"), str(install))
    return install


def build_v0434_fixture(root: pathlib.Path) -> pathlib.Path:
    install = v0434.build_v0433_fixture(root)
    package = root / "v0434-package"
    with zipfile.ZipFile(ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.4_GoogleOAuthFix.zip") as archive:
        archive.extractall(package)
    run(str(package / "phase36_v0434_preflight.py"), "--app-root", str(install))
    run(str(package / "patch_v0434.py"), str(install), str(package))
    run(str(package / "set_version_v0434.py"), str(install))
    run(str(package / "validate_v0434.py"), str(install))
    return install


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_update(source_version: str, package: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_v0434_fixture(root) if source_version == "0.4.3.4" else build_v0435_fixture(root)
        preserved = {path: path.read_bytes() for path in (install / "data").rglob("*.json")}
        preserved.update({path: path.read_bytes() for path in (install / "config").rglob("settings.json")})
        preserved.update({path: path.read_bytes() for path in (install / "updater").rglob("*.json")})
        auth_core = install / "src" / "ai_article_studio" / "core" / "auth_service.py"
        auth_ui = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
        before_ui = digest(auth_ui)

        run(str(package / "phase36_v0436_preflight.py"), "--app-root", str(install))
        run(str(package / "patch_v0436.py"), str(install), str(package))
        run(str(package / "set_version_v0436.py"), str(install))
        run(str(package / "validate_v0436.py"), str(install))
        fixed = auth_ui.read_bytes()
        assert digest(auth_ui) != before_ui
        assert 'self.ui_mode = "admin"' in fixed.decode("utf-8")
        assert "ユーザーモードへ" in fixed.decode("utf-8")
        assert '__version__ = "0.4.3.6"' in (install / "src" / "ai_article_studio" / "__init__.py").read_text(encoding="utf-8")
        run(str(package / "patch_v0436.py"), str(install), str(package))
        assert auth_ui.read_bytes() == fixed
        assert all(path.read_bytes() == value for path, value in preserved.items())


def main() -> None:
    run(str(ROOT / "release" / "v0436" / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0436.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.6"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0436.json"))

    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        package = root / "v0436-package"
        with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
            assert archive.testzip() is None
            archive.extractall(package)
        for source_version in ("0.4.3.4", "0.4.3.5"):
            test_update(source_version, package)
    print("V0.4.3.6 UPDATE PACKAGE TESTS OK")


if __name__ == "__main__":
    main()
