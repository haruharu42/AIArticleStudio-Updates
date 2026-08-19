from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import sys
import zipfile
from urllib.parse import urlparse

REPO = "haruharu42/AIArticleStudio-Updates"
RAW_HOST = "raw.githubusercontent.com"
SHA_RE = re.compile(r"^[0-9A-Fa-f]{64}$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def is_safe_zip_name(name: str) -> bool:
    p = pathlib.PurePosixPath(name)
    return not (p.is_absolute() or ".." in p.parts or "\\" in name)


def main() -> None:
    manifest_path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "latest.json")
    if not manifest_path.is_file():
        fail(f"manifest not found: {manifest_path}")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid UTF-8 JSON manifest: {exc}")

    for key in ("version", "package_url", "sha256", "channel", "notes"):
        if key not in manifest:
            fail(f"manifest is missing required field: {key}")

    version = str(manifest["version"]).strip()
    if not VERSION_RE.fullmatch(version):
        fail(f"invalid version: {version}")

    expected_sha = str(manifest["sha256"]).strip()
    if not SHA_RE.fullmatch(expected_sha):
        fail("sha256 must be exactly 64 hexadecimal characters")

    parsed = urlparse(str(manifest["package_url"]))
    if parsed.scheme != "https" or parsed.netloc != RAW_HOST:
        fail("package_url must use https://raw.githubusercontent.com")

    expected_prefix = f"/{REPO}/main/updates/"
    if not parsed.path.startswith(expected_prefix):
        fail(f"package_url must point to {REPO}/main/updates/")
    if parsed.query or parsed.fragment:
        fail("package_url must be immutable and must not contain query or fragment components")

    package_name = pathlib.PurePosixPath(parsed.path).name
    if f"v{version}" not in package_name:
        fail(f"package filename must contain v{version}: {package_name}")
    if not package_name.lower().endswith(".zip"):
        fail("package must be a .zip file")

    package_path = pathlib.Path("updates") / package_name
    if not package_path.is_file():
        fail(f"package referenced by manifest does not exist in repository: {package_path}")

    actual_sha = hashlib.sha256(package_path.read_bytes()).hexdigest().upper()
    if actual_sha != expected_sha.upper():
        fail(f"SHA256 mismatch: expected {expected_sha.upper()}, got {actual_sha}")

    try:
        with zipfile.ZipFile(package_path) as zf:
            bad = zf.testzip()
            if bad:
                fail(f"corrupt ZIP member: {bad}")
            names = zf.namelist()
            if not names:
                fail("ZIP is empty")
            unsafe = [name for name in names if not is_safe_zip_name(name)]
            if unsafe:
                fail(f"unsafe ZIP path: {unsafe[0]}")
            if not any(pathlib.PurePosixPath(n).name.lower() == "update.ps1" for n in names):
                fail("ZIP must contain Update.ps1")

            for info in zf.infolist():
                if info.is_dir():
                    continue
                if info.file_size > 100 * 1024 * 1024:
                    fail(f"unexpectedly large ZIP member: {info.filename}")

            # Compile Python source contained in the package without executing it.
            for name in names:
                if name.lower().endswith(".py"):
                    raw = zf.read(name)
                    try:
                        text = raw.decode("utf-8-sig")
                    except UnicodeDecodeError as exc:
                        fail(f"Python file is not UTF-8: {name}: {exc}")
                    try:
                        compile(text, name, "exec")
                    except SyntaxError as exc:
                        fail(f"Python syntax error in package: {name}: {exc}")

            # PowerShell inline python -c commands must stay ASCII-only on Windows PowerShell 5.1.
            for name in names:
                if name.lower().endswith(".ps1"):
                    raw = zf.read(name)
                    text = raw.decode("utf-8-sig", errors="replace")
                    for line_no, line in enumerate(text.splitlines(), 1):
                        low = line.lower()
                        if "python" in low and "-c" in low:
                            try:
                                line.encode("ascii")
                            except UnicodeEncodeError:
                                fail(
                                    f"non-ASCII inline python -c command in {name}:{line_no}; "
                                    "use a UTF-8 .py validation file instead"
                                )
    except zipfile.BadZipFile as exc:
        fail(f"invalid ZIP central directory: {exc}")

    print("RELEASE VALIDATION OK")
    print(f"Version : v{version}")
    print(f"Package : {package_name}")
    print(f"SHA256  : {actual_sha}")


if __name__ == "__main__":
    main()
