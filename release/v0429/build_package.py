from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.2.9"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.2.9_LiveArticleCreatorHook.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0429"
RELEASE_FILES = (
    "README.txt",
    "Update.ps1",
    "phase36_v0429_preflight.py",
    "patch_v0429.py",
    "set_version_v0429.py",
    "validate_v0429.py",
)
PAYLOAD_MODULES = (
    "guided_wizard_v0427.py",
    "guided_wizard_v0428.py",
    "guided_wizard_v0429.py",
)
FIXED_DATE = (2026, 8, 21, 1, 0, 0)
TEXT_SUFFIXES = {".json", ".md", ".ps1", ".py", ".txt", ".yml", ".yaml"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def canonical_bytes(path: Path) -> bytes:
    raw = path.read_bytes()
    if path.suffix.lower() not in TEXT_SUFFIXES:
        return raw
    return raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


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
    for name in RELEASE_FILES:
        shutil.copy2(ROOT / "release" / "v0429" / name, STAGE / name)
    payload = STAGE / "payload" / "ui"
    payload.mkdir(parents=True)
    for name in PAYLOAD_MODULES:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "ui" / name, payload / name)
    PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACKAGE_PATH.unlink(missing_ok=True)
    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in sorted((item for item in STAGE.rglob("*") if item.is_file()), key=lambda item: item.relative_to(STAGE).as_posix()):
            name = path.relative_to(STAGE).as_posix()
            archive.writestr(zip_info(name), canonical_bytes(path), compress_type=zipfile.ZIP_STORED)
    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "stable",
        "notes": "v0.4.2.9: activates the approved six-step UI from the real Article Creator navigation event and validates the live Tk event path on Windows.",
    }
    (ROOT / "candidate-v0429.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0429" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")
    with zipfile.ZipFile(PACKAGE_PATH) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        required = set(RELEASE_FILES) | {f"payload/ui/{name}" for name in PAYLOAD_MODULES}
        missing = required - set(archive.namelist())
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
