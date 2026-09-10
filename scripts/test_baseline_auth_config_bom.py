from __future__ import annotations

import codecs
import json
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = REPO_ROOT / "src"

if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthConfig,
    AuthConfigurationError,
)


def write_auth_json(
    root: Path,
    payload: dict,
    *,
    bom: bool,
) -> None:
    path = root / "config" / "auth.json"

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    raw = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")

    if bom:
        raw = codecs.BOM_UTF8 + raw

    path.write_bytes(raw)


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)

        expected_url = (
            "https://example.supabase.co"
        )

        expected_key = (
            "publishable-test-key"
        )

        # UTF-8 BOM付きauth.jsonが正常に読めること。
        write_auth_json(
            root,
            {
                "supabase_url": expected_url,
                "anon_key": expected_key,
                "required": True,
            },
            bom=True,
        )

        loaded = AuthConfig.load(
            root,
            {},
        )

        assert loaded.supabase_url == expected_url
        assert loaded.anon_key == expected_key
        assert loaded.required is True

        print(
            "PASS auth.json UTF-8 BOM load"
        )

        # BOM付きでもservice_role拒否が維持されること。
        write_auth_json(
            root,
            {
                "service_role":
                    "must-not-load",
            },
            bom=True,
        )

        try:
            AuthConfig.load(
                root,
                {},
            )

        except AuthConfigurationError as exc:
            assert (
                exc.code
                == "service_role_rejected"
            )

        else:
            raise AssertionError(
                "service_role config was accepted"
            )

        print(
            "PASS BOM service_role rejection"
        )

        # 従来のBOMなしUTF-8も壊していないこと。
        write_auth_json(
            root,
            {
                "supabase_url": expected_url,
                "anon_key": expected_key,
                "required": False,
            },
            bom=False,
        )

        loaded_plain = AuthConfig.load(
            root,
            {},
        )

        assert (
            loaded_plain.supabase_url
            == expected_url
        )

        assert (
            loaded_plain.anon_key
            == expected_key
        )

        assert loaded_plain.required is False

        print(
            "PASS plain UTF-8 auth.json load"
        )

        # BOM付き不正JSONは従来どおり拒否すること。
        invalid = (
            root
            / "config"
            / "auth.json"
        )

        invalid.write_bytes(
            codecs.BOM_UTF8
            + b"{invalid-json"
        )

        try:
            AuthConfig.load(
                root,
                {},
            )

        except AuthConfigurationError as exc:
            assert (
                exc.code
                == "invalid_auth_config"
            )

        else:
            raise AssertionError(
                "Malformed auth.json was accepted"
            )

        print(
            "PASS malformed BOM JSON rejection"
        )

    print(
        "BASELINE_AUTH_CONFIG_BOM: PASS"
    )


if __name__ == "__main__":
    main()
