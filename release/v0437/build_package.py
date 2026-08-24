from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.3.7"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.7_AdminUIPayloadRepair.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0437"
FIXED_DATE = (2026, 8, 25, 6, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, FIXED_DATE)
    info.create_system = 3
    info.compress_type = zipfile.ZIP_STORED
    info.external_attr = 0o644 << 16
    return info


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    files = {
        ROOT / "release" / "v0437" / "README.txt": STAGE / "README.txt",
        ROOT / "release" / "v0437" / "Update.ps1": STAGE / "Update.ps1",
        ROOT / "release" / "v0437" / "phase36_v0437_preflight.py": STAGE / "phase36_v0437_preflight.py",
        ROOT / "release" / "v0437" / "patch_v0437.py": STAGE / "patch_v0437.py",
        ROOT / "release" / "v0433" / "cleanup_v0433.py": STAGE / "cleanup_v0437.py",
        ROOT / "release" / "v0437" / "set_version_v0437.py": STAGE / "set_version_v0437.py",
        ROOT / "release" / "v0437" / "validate_v0437.py": STAGE / "validate_v0437.py",
        ROOT / "src" / "ai_article_studio" / "ui" / "auth_ui.py": STAGE / "payload" / "ui" / "auth_ui.py",
        ROOT / "updates" / "AIArticleStudio_Update_v0.4.3.6_AdminUserMode.zip": STAGE / "base" / "AIArticleStudio_Update_v0.4.3.6_AdminUserMode.zip",
    }
    for source, destination in files.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACKAGE_PATH.unlink(missing_ok=True)
    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in sorted(
            (item for item in STAGE.rglob("*") if item.is_file()),
            key=lambda item: item.relative_to(STAGE).as_posix(),
        ):
            data = path.read_bytes()
            if path.suffix.lower() in {".py", ".ps1", ".txt"}:
                data = (
                    data.decode("utf-8-sig")
                    .replace("\r\n", "\n")
                    .replace("\r", "\n")
                    .encode("utf-8")
                )
            archive.writestr(
                zip_info(path.relative_to(STAGE).as_posix()),
                data,
                compress_type=zipfile.ZIP_STORED,
            )
    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": (
            "https://raw.githubusercontent.com/haruharu42/"
            f"AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}"
        ),
        "sha256": digest,
        "channel": "stable",
        "notes": (
            "v0.4.3.7: forces the verified Admin UI payload onto Windows installations "
            "that already report v0.4.3.6, and verifies the installed auth_ui.py SHA256. "
            "No feature, database, OAuth, or role changes."
        ),
    }
    (ROOT / "candidate-v0437.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (ROOT / "release" / "v0437" / "SHA256.txt").write_text(
        digest + "  " + PACKAGE_NAME + "\n",
        encoding="ascii",
    )
    with zipfile.ZipFile(PACKAGE_PATH) as archive:
        if archive.testzip():
            raise RuntimeError("ZIP CRC validation failed")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
