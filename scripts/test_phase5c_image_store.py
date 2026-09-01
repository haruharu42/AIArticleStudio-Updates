from __future__ import annotations

from pathlib import Path
import tempfile

from ai_article_studio.core.image_assets import ArticleImageStore, MAX_IMAGE_BYTES


PNG = b"\x89PNG\r\n\x1a\n" + b"phase5c-image"
JPEG = b"\xff\xd8\xff\xe0" + b"phase5c-image"


def write(path: Path, value: bytes) -> Path:
    path.write_bytes(value)
    return path


def test_import_replace_and_preserve_sidecar() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_store_") as temp_name:
        root = Path(temp_name)
        store = ArticleImageStore(root / "managed")
        store.save_payload("AAS-ARTICLE", {"future_field": {"keep": True}, "assets": [{"prompt": "keep"}]})
        first = store.add_managed_asset("AAS-ARTICLE", write(root / "wrong.txt", PNG), asset_type="cover")
        assert first["mime_type"] == "image/png"
        assert store.managed_file_path("AAS-ARTICLE", first).read_bytes() == PNG
        assert first["original_filename"] == "wrong.txt"

        second = store.add_managed_asset("AAS-ARTICLE", write(root / "second.jpg", JPEG), asset_type="cover")
        visible = store.list_managed_assets("AAS-ARTICLE")
        assert [item["local_asset_id"] for item in visible] == [second["local_asset_id"]]
        assert not store.managed_file_path("AAS-ARTICLE", first).exists()
        payload = store.load_payload("AAS-ARTICLE")
        assert payload["future_field"] == {"keep": True}
        assert payload["assets"] == [{"prompt": "keep"}]
        assert "signed_url" not in str(payload).lower()
        store.save_payload("AAS-ARTICLE", {"image_settings": {"enabled": True}})
        after_prompt_refresh = store.load_payload("AAS-ARTICLE")
        assert after_prompt_refresh["managed_assets"][0]["local_asset_id"] == second["local_asset_id"]


def test_cloud_replacement_and_delete_keep_local_until_confirmed() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_delete_") as temp_name:
        root = Path(temp_name)
        store = ArticleImageStore(root / "managed")
        first = store.add_managed_asset("article", write(root / "first.png", PNG), asset_type="cover")
        store.update_managed_asset("article", first["local_asset_id"], {
            "cloud_asset_id": "00000000-0000-0000-0000-000000000001",
            "cloud_status": "ready",
            "storage_bucket": "article-assets",
            "storage_path": "u/a/asset.png",
        })
        store.add_managed_asset("article", write(root / "second.png", PNG + b"2"), asset_type="cover")
        all_assets = store.list_managed_assets("article", include_deleted=True)
        old = next(item for item in all_assets if item["local_asset_id"] == first["local_asset_id"])
        assert old["desired_state"] == "delete"
        assert store.managed_file_path("article", old).is_file()
        store.remove_managed_asset("article", old["local_asset_id"])
        assert not store.managed_file_path("article", old).exists()


def test_validation() -> None:
    with tempfile.TemporaryDirectory(prefix="aas_phase5c_validation_") as temp_name:
        root = Path(temp_name)
        store = ArticleImageStore(root / "managed")
        bad = write(root / "bad.png", b"not-an-image")
        try:
            store.add_managed_asset("article", bad, asset_type="cover")
        except ValueError:
            pass
        else:
            raise AssertionError("extension-only validation was accepted")
        too_large = write(root / "large.png", b"\x89PNG\r\n\x1a\n" + b"x" * MAX_IMAGE_BYTES)
        try:
            store.add_managed_asset("article", too_large, asset_type="cover")
        except ValueError:
            pass
        else:
            raise AssertionError("oversized image was accepted")
        try:
            store.add_managed_asset("article", write(root / "inline.png", PNG), asset_type="inline")
        except ValueError:
            pass
        else:
            raise AssertionError("inline image without marker was accepted")


def main() -> None:
    test_import_replace_and_preserve_sidecar()
    test_cloud_replacement_and_delete_keep_local_until_confirmed()
    test_validation()
    print("PHASE5C_IMAGE_STORE: PASS")


if __name__ == "__main__":
    main()
