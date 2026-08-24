from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import zipfile


ROOT = Path(__file__).resolve().parents[2]
VERSION = "0.4.3.5"
PACKAGE_NAME = "AIArticleStudio_Update_v0.4.3.5_AdminUserManagement.zip"
PACKAGE_PATH = ROOT / "updates" / PACKAGE_NAME
STAGE = ROOT / ".build_v0435"
FIXED_DATE = (2026, 8, 24, 3, 0, 0)
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
    release_files = {
        ROOT / "release" / "v0435" / "README.txt": STAGE / "README.txt",
        ROOT / "release" / "v0435" / "Update.ps1": STAGE / "Update.ps1",
        ROOT / "release" / "v0435" / "phase36_v0435_preflight.py": STAGE / "phase36_v0435_preflight.py",
        ROOT / "release" / "v0435" / "patch_v0435.py": STAGE / "patch_v0435.py",
        ROOT / "release" / "v0434" / "patch_v0434.py": STAGE / "patch_v0434.py",
        ROOT / "release" / "v0433" / "patch_v0433.py": STAGE / "patch_v0433.py",
        ROOT / "release" / "v0433" / "cleanup_v0433.py": STAGE / "cleanup_v0435.py",
        ROOT / "release" / "v0435" / "set_version_v0435.py": STAGE / "set_version_v0435.py",
        ROOT / "release" / "v0435" / "validate_v0435.py": STAGE / "validate_v0435.py",
    }
    payloads = {
        ROOT / "src" / "ai_article_studio" / "ui" / name: STAGE / "payload" / "ui" / name
        for name in ("guided_wizard_v0427.py", "guided_wizard_v0432.py", "auth_ui.py")
    }
    payloads.update({
        ROOT / "src" / "ai_article_studio" / "core" / name: STAGE / "payload" / "core" / name
        for name in ("article_publish_text.py", "web_ai_workflow.py", "web_ai_ui_bridge.py", "image_prompt_builder.py", "auth_service.py")
    })
    payloads.update({
        ROOT / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql": STAGE / "payload" / "supabase" / "migrations" / "202608230001_phase_auth_ui_foundation.sql",
        ROOT / "supabase" / "migrations" / "202608240001_admin_user_management.sql": STAGE / "payload" / "supabase" / "migrations" / "202608240001_admin_user_management.sql",
        ROOT / "docs" / "AUTH_UI_FOUNDATION.md": STAGE / "payload" / "docs" / "AUTH_UI_FOUNDATION.md",
        ROOT / "config" / "auth.example.json": STAGE / "payload" / "config" / "auth.example.json",
    })
    for source, destination in {**release_files, **payloads}.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    PACKAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACKAGE_PATH.unlink(missing_ok=True)
    with zipfile.ZipFile(PACKAGE_PATH, "w", compression=zipfile.ZIP_STORED) as archive:
        for path in sorted((item for item in STAGE.rglob("*") if item.is_file()), key=lambda item: item.relative_to(STAGE).as_posix()):
            archive.writestr(zip_info(path.relative_to(STAGE).as_posix()), canonical_bytes(path), compress_type=zipfile.ZIP_STORED)
    digest = sha256(PACKAGE_PATH)
    manifest = {
        "version": VERSION,
        "package_url": f"https://raw.githubusercontent.com/haruharu42/AIArticleStudio-Updates/main/updates/{PACKAGE_NAME}",
        "sha256": digest,
        "channel": "stable",
        "notes": "v0.4.3.5: adds active-admin-only user listing, approval, suspension, reactivation, self-protection, and minimal audit logging through secured Supabase RPCs. Cumulative from v0.4.2.9-v0.4.3.4.",
    }
    (ROOT / "candidate-v0435.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "release" / "v0435" / "SHA256.txt").write_text(digest + "  " + PACKAGE_NAME + "\n", encoding="ascii")
    with zipfile.ZipFile(PACKAGE_PATH) as archive:
        if archive.testzip():
            raise RuntimeError("ZIP CRC validation failed")
        required = {destination.relative_to(STAGE).as_posix() for destination in (*release_files.values(), *payloads.values())}
        missing = required - set(archive.namelist())
        if missing:
            raise RuntimeError(f"ZIP missing required files: {sorted(missing)}")
    print(f"BUILT {PACKAGE_NAME}")
    print(f"SHA256 {digest}")


if __name__ == "__main__":
    main()
