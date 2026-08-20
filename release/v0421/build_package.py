from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.2.1"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.2.1_ImageSettingsVisible.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0421"
RELEASE_FILES = [
    "README.txt",
    "Update.ps1",
    "phase36_v0421_preflight.py",
    "patch_v0421.py",
    "set_version_v0421.py",
    "validate_v0421.py",
]
FIXED_DATE = (2026, 8, 20, 0, 0, 0)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def write_deterministic_zip(source_root: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(p for p in source_root.rglob("*") if p.is_file()):
            arcname = path.relative_to(source_root).as_posix()
            info = zipfile.ZipInfo(arcname, FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    STAGE.mkdir(parents=True)
    for name in RELEASE_FILES:
        shutil.copy2(ROOT / "release" / "v0421" / name, STAGE / name)
    write_deterministic_zip(STAGE, PACKAGE_PATH)
    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "hotfix",
        "notes": "v0.4.2.1 hotfix: makes image generation settings and Web AI settings visible in the article creation screen.",
    }
    (ROOT / "candidate-v0421.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0421" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")
    with zipfile.ZipFile(PACKAGE_PATH) as zf:
        bad = zf.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        required = set(RELEASE_FILES)
        missing = required - set(zf.namelist())
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
