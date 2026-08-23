from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.3.3"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.3_AuthUIFoundation.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0433"
RELEASE_FILES = (
    "README.txt",
    "Update.ps1",
    "phase36_v0433_preflight.py",
    "patch_v0433.py",
    "cleanup_v0433.py",
    "set_version_v0433.py",
    "validate_v0433.py",
)
FIXED_DATE = (2026, 8, 23, 12, 0, 0)
TEXT_SUFFIXES = {".json", ".md", ".ps1", ".py", ".sql", ".txt", ".yml", ".yaml"}


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
        shutil.copy2(ROOT / "release" / "v0433" / name, STAGE / name)

    payloads = {
        ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0427.py": STAGE / "payload" / "ui" / "guided_wizard_v0427.py",
        ROOT / "src" / "ai_article_studio" / "ui" / "guided_wizard_v0432.py": STAGE / "payload" / "ui" / "guided_wizard_v0432.py",
        ROOT / "src" / "ai_article_studio" / "ui" / "auth_ui.py": STAGE / "payload" / "ui" / "auth_ui.py",
        ROOT / "src" / "ai_article_studio" / "core" / "article_publish_text.py": STAGE / "payload" / "core" / "article_publish_text.py",
        ROOT / "src" / "ai_article_studio" / "core" / "web_ai_workflow.py": STAGE / "payload" / "core" / "web_ai_workflow.py",
        ROOT / "src" / "ai_article_studio" / "core" / "web_ai_ui_bridge.py": STAGE / "payload" / "core" / "web_ai_ui_bridge.py",
        ROOT / "src" / "ai_article_studio" / "core" / "image_prompt_builder.py": STAGE / "payload" / "core" / "image_prompt_builder.py",
        ROOT / "src" / "ai_article_studio" / "core" / "auth_service.py": STAGE / "payload" / "core" / "auth_service.py",
        ROOT / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql": STAGE / "payload" / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql",
        ROOT / "docs" / "AUTH_UI_FOUNDATION.md": STAGE / "payload" / "docs" / "AUTH_UI_FOUNDATION.md",
        ROOT / "config" / "auth.example.json": STAGE / "payload" / "config" / "auth.example.json",
    }
    for source, destination in payloads.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

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
        "notes": "v0.4.3.3: cumulative update from v0.4.2.9-v0.4.3.2 adding the Supabase Auth foundation, DPAPI session persistence, consent-aware registration, and server-profile-driven User/Admin navigation without changing existing article data or workflows.",
    }
    (ROOT / "candidate-v0433.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0433" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")
    with zipfile.ZipFile(PACKAGE_PATH) as archive:
        if archive.testzip():
            raise RuntimeError("ZIP CRC validation failed")
        required = set(RELEASE_FILES) | {destination.relative_to(STAGE).as_posix() for destination in payloads.values()}
        missing = required - set(archive.namelist())
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
