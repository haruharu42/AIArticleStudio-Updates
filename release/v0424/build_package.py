from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.2.4"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.2.4_ImagePlanning.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0424"
CORE_FILES = ["image_settings.py", "image_prompt_builder.py", "web_prompt_engine_v2.py", "web_ai_workflow.py"]
RELEASE_FILES = [
    "README.txt",
    "Update.ps1",
    "phase36_v0424_preflight.py",
    "patch_v0424.py",
    "set_version_v0424.py",
    "validate_v0424.py",
]
FIXED_DATE = (2026, 8, 20, 0, 0, 0)
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
    text = raw.decode("utf-8-sig")
    return text.replace("\r\n", "\n").replace("\r", "\n").encode("utf-8")


def deterministic_zip_info(arcname: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(arcname, FIXED_DATE)
    info.create_system = 3
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    return info


def write_deterministic_zip(source_root: Path, output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(item for item in source_root.rglob("*") if item.is_file()):
            info = deterministic_zip_info(path.relative_to(source_root).as_posix())
            archive.writestr(info, canonical_bytes(path), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> None:
    if STAGE.exists():
        shutil.rmtree(STAGE)
    (STAGE / "payload" / "core").mkdir(parents=True)
    for name in RELEASE_FILES:
        shutil.copy2(ROOT / "release" / "v0424" / name, STAGE / name)
    for name in CORE_FILES:
        shutil.copy2(ROOT / "src" / "ai_article_studio" / "core" / name, STAGE / "payload" / "core" / name)
    write_deterministic_zip(STAGE, PACKAGE_PATH)
    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "preview",
        "notes": "v0.4.2.4: moves image planning before article creation, separates eyecatch/illustration choices, and adds article-aware illustration counts up to six.",
    }
    (ROOT / "candidate-v0424.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0424" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")
    with zipfile.ZipFile(PACKAGE_PATH) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"ZIP CRC failure: {bad}")
        required = set(RELEASE_FILES) | {f"payload/core/{name}" for name in CORE_FILES}
        missing = required - set(archive.namelist())
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
