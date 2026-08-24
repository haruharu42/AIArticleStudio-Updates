from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import tempfile
import zipfile


ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.7_AdminUIPayloadRepair.zip"

sys.path.insert(0, str(ROOT / "scripts"))
import test_v0436_update_package as v0436  # noqa: E402


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=ROOT, check=True)


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def build_v0436_stale_fixture(root: pathlib.Path) -> pathlib.Path:
    install = v0436.build_v0435_fixture(root)
    auth_ui = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
    stale_ui = auth_ui.read_bytes()
    package = root / "v0436-package"
    with zipfile.ZipFile(
        ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.6_AdminUserMode.zip"
    ) as archive:
        archive.extractall(package)
    run(str(package / "phase36_v0436_preflight.py"), "--app-root", str(install))
    run(str(package / "patch_v0436.py"), str(install), str(package))
    run(str(package / "set_version_v0436.py"), str(install))
    run(str(package / "validate_v0436.py"), str(install))
    auth_ui.write_bytes(stale_ui)
    assert '__version__ = "0.4.3.6"' in (
        install / "src" / "ai_article_studio" / "__init__.py"
    ).read_text(encoding="utf-8")
    assert "USER MANAGEMENT" in auth_ui.read_text(encoding="utf-8")
    assert "ユーザーモードへ" not in auth_ui.read_text(encoding="utf-8")
    return install


def build_fixture(root: pathlib.Path, source_version: str) -> pathlib.Path:
    if source_version == "0.4.3.4":
        return v0436.build_v0434_fixture(root)
    if source_version == "0.4.3.5":
        return v0436.build_v0435_fixture(root)
    return build_v0436_stale_fixture(root)


def test_update(source_version: str, package: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = pathlib.Path(tmp)
        install = build_fixture(root, source_version)
        preserved = {path: path.read_bytes() for path in (install / "data").rglob("*.json")}
        preserved.update(
            {path: path.read_bytes() for path in (install / "config").rglob("settings.json")}
        )
        preserved.update(
            {path: path.read_bytes() for path in (install / "updater").rglob("*.json")}
        )
        auth_ui = install / "src" / "ai_article_studio" / "ui" / "auth_ui.py"
        payload_ui = package / "payload" / "ui" / "auth_ui.py"
        before = digest(auth_ui)

        run(str(package / "phase36_v0437_preflight.py"), "--app-root", str(install))
        run(str(package / "patch_v0437.py"), str(install), str(package))
        run(str(package / "set_version_v0437.py"), str(install))
        run(str(package / "validate_v0437.py"), str(install), str(package))

        text = auth_ui.read_text(encoding="utf-8")
        assert digest(auth_ui) == digest(payload_ui)
        if source_version == "0.4.3.6":
            assert digest(auth_ui) != before
        assert "ユーザーモードへ" in text
        assert "管理者モードへ" in text
        assert 'self.ui_mode == "admin" and can_manage_users' in text
        assert '__version__ = "0.4.3.7"' in (
            install / "src" / "ai_article_studio" / "__init__.py"
        ).read_text(encoding="utf-8")
        assert all(path.read_bytes() == value for path, value in preserved.items())


def main() -> None:
    run(str(ROOT / "release" / "v0437" / "build_package.py"))
    manifest = json.loads((ROOT / "candidate-v0437.json").read_text(encoding="utf-8"))
    assert manifest["version"] == "0.4.3.7"
    run(str(ROOT / "scripts" / "validate_release.py"), str(ROOT / "candidate-v0437.json"))

    with tempfile.TemporaryDirectory() as tmp:
        package = pathlib.Path(tmp) / "v0437-package"
        with zipfile.ZipFile(ROOT / "updates" / PACKAGE_NAME) as archive:
            assert archive.testzip() is None
            archive.extractall(package)
        for source_version in ("0.4.3.4", "0.4.3.5", "0.4.3.6"):
            test_update(source_version, package)
    print("V0.4.3.7 UPDATE REPAIR TESTS OK")


if __name__ == "__main__":
    main()
