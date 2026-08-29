from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import tempfile

from ai_article_studio.core.db import ArticleDB
from ai_article_studio.core.image_assets import ArticleImageStore
from ai_article_studio.core.web_ai_state import WebAIStateStore, WebAIWorkflowState
from ai_article_studio.core.web_ai_ui_bridge import WebAIUIBridge
from ai_article_studio.core.web_ai_workflow import WebAIWorkflow
from ai_article_studio.ui.guided_wizard_v0432 import (
    _existing_live_article_wizard,
    _load_library_edit_context,
    _restore_library_request,
    _save_library_article_edit,
)


class Variable:
    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value

    def set(self, value):
        self.value = value


class App:
    def __init__(self, root: Path):
        self.db = ArticleDB(root / "articles.db")
        workflow = WebAIWorkflow(
            state_store=WebAIStateStore(
                root / "web_ai_workflow_state.json",
                history_path=root / "web_ai_workflow_history.json",
            ),
            image_store=ArticleImageStore(root / "articles"),
        )
        self.web_ai_bridge = WebAIUIBridge(workflow)
        self.current_record = None
        self.vars = {
            "platform": Variable("note"),
            "article_type": Variable("無料"),
            "genre": Variable("AI副業"),
            "subgenre": Variable("実践ガイド"),
            "target_age": Variable("30代"),
            "target_gender": Variable("指定なし"),
            "reader_level": Variable("初心者"),
            "word_count": Variable("約4,000字"),
            "theme": Variable("テストテーマ"),
            "price": Variable("980"),
            "affiliate_enabled": Variable(False),
            "magazine_enabled": Variable(False),
            "image_eyecatch_enabled": Variable(False),
            "image_illustrations_enabled": Variable(False),
            "image_mode": Variable("Web版（おすすめ）"),
            "image_style": Variable("おまかせ"),
            "image_count": Variable("AIにおまかせ"),
            "image_insert_markers": Variable(True),
        }

    def _make_request(self):
        raise RuntimeError("not needed in this regression test")


class DisplayedRoot:
    master = object()

    def winfo_exists(self):
        return True

    def winfo_manager(self):
        return "pack"


class WizardApp:
    def __init__(self):
        self._v0432_article_wizard = {
            "root": DisplayedRoot(),
            "pages": [object()] * 6,
        }


def article_payload(article_id: str, title: str, article_type: str, *, eye=False, inline=False):
    now = datetime.now(timezone.utc).isoformat()
    return {
        "article_id": article_id,
        "created_at": now,
        "updated_at": now,
        "status": "完成",
        "title": title,
        "theme": "保存済みテーマ",
        "request": {
            "platform": "note",
            "article_type": article_type,
            "genre": "AI副業",
            "subgenre": "実践ガイド",
            "target_age": "30代",
            "target_gender": "指定なし",
            "reader_level": "初心者",
            "word_count": "約4,000字",
            "theme": "保存済みテーマ",
            "price_jpy": 980 if article_type == "有料" else None,
            "affiliate_enabled": False,
            "magazine_enabled": False,
            "image_eyecatch_enabled": eye,
            "image_illustrations_enabled": inline,
            "image_count": "3" if inline else "AIにおまかせ",
            "image_style": "アニメ風" if eye or inline else "おまかせ",
            "image_insert_markers": inline,
        },
        "content": {
            "blocks": [{"markdown": "# 掲載用本文\n\n本文"}],
            "web_original": "# 元記事\n\n## 見出し\n\n本文",
            "web_publish": "# 掲載用本文\n\n本文",
            "web_current": "# 現在の完成本文\n\n## 見出し\n\n本文",
            "source": "web_ai",
        },
        "article_plan": {"keep": True},
        "revision_history": [],
        "generation_history": [],
        "cost_estimate": {},
        "cost_actual": {"total_jpy": 0},
    }


def seed(app: App, payload: dict, *, eye=False, inline=False):
    app.db.save(deepcopy(payload))
    target = "both" if eye and inline else "eyecatch" if eye else "illustrations" if inline else "both"
    settings = {
        "enabled": eye or inline,
        "target": target,
        "mode": "web",
        "style": "anime" if eye or inline else "auto",
        "illustration_count": "3" if inline else "auto",
        "insert_markers": inline,
    }
    state = WebAIWorkflowState(
        article_id=payload["article_id"],
        current_step="05",
        article_request=deepcopy(payload["request"]),
        selected_title=payload["title"],
        raw_web_output=payload["content"]["web_original"],
        normalized_output=payload["content"]["web_current"],
        formatted_output=payload["content"]["web_publish"],
        image_settings=settings,
        is_completed=True,
    )
    app.web_ai_bridge.workflow.state_store.save(state)
    if eye or inline:
        app.web_ai_bridge.workflow.image_store.save_payload(
            payload["article_id"],
            {
                "image_settings": settings,
                "assets": [
                    {"id": "cover-1", "role": "eyecatch", "status": "ready"}
                ] if eye else [],
                "items": [
                    {"id": f"inline-{index}", "role": "illustration", "position": f"marker-{index}"}
                    for index in range(1, 4)
                ] if inline else [],
                "custom_metadata": {"must_survive": True},
            },
        )


def ids(app: App):
    return [row["article_id"] for row in app.db.list_articles()]


def main():
    active = WizardApp()
    assert _existing_live_article_wizard(active) is active._v0432_article_wizard

    with tempfile.TemporaryDirectory() as temp_name:
        root = Path(temp_name)
        user = App(root / "AAS-000002")
        admin = App(root / "AAS-000001")
        cases = (
            ("free-no-image", "無料・画像なし", "無料", False, False),
            ("paid-no-image", "有料・画像なし", "有料", False, False),
            ("cover-only", "アイキャッチあり", "無料", True, False),
            ("inline-only", "挿絵あり", "無料", False, True),
            ("cover-inline", "アイキャッチ＋挿絵", "有料", True, True),
        )
        for article_id, title, article_type, eye, inline in cases:
            seed(user, article_payload(article_id, title, article_type, eye=eye, inline=inline), eye=eye, inline=inline)

        # 1-5: every image combination remains an unconditional library row.
        assert set(ids(user)) == {item[0] for item in cases}
        for article_id, _title, _article_type, _eye, _inline in cases:
            assert user.db.load(article_id) is not None
        corrupt_path = user.web_ai_bridge.workflow.image_store.metadata_path("cover-only")
        corrupt_path.write_text("{broken image metadata", encoding="utf-8")
        assert "cover-only" in ids(user)
        corrupt_context = _load_library_edit_context(user, user.db.load("cover-only"))
        assert corrupt_context["article_id"] == "cover-only"
        assert corrupt_context["image_payload"] == {}

        target_id = "cover-inline"
        original_count = len(ids(user))
        original_sidecar_path = user.web_ai_bridge.workflow.image_store.metadata_path(target_id)
        original_sidecar = original_sidecar_path.read_bytes()
        context = _load_library_edit_context(user, user.db.load(target_id))
        assert context["article_id"] == target_id
        assert context["current_article"].startswith("# 現在の完成本文")
        _restore_library_request(user, context)

        # 6-7, 10-12: same id, new title/body, no duplicate, untouched image data.
        user.vars["article_type"].set("有料")
        saved = _save_library_article_edit(
            user,
            context,
            "再編集後タイトル",
            "# 再編集後本文\n\n## 見出し\n\n更新本文",
        )
        assert saved["article_id"] == target_id
        assert saved["title"] == "再編集後タイトル"
        assert saved["content"]["web_current"].startswith("# 再編集後本文")
        assert saved["article_plan"] == {"keep": True}
        assert len(ids(user)) == original_count
        assert original_sidecar_path.read_bytes() == original_sidecar

        context = _load_library_edit_context(user, saved)
        _restore_library_request(user, context)
        saved_again = _save_library_article_edit(user, context, "再編集2回目", "# 本文2回目\n\n本文")
        assert saved_again["article_id"] == target_id
        assert len(ids(user)) == original_count

        # 8-9: free/paid changes update the same row and payload.
        user.vars["article_type"].set("無料")
        context = _load_library_edit_context(user, saved_again)
        _restore_library_request(user, context)
        user.vars["article_type"].set("無料")
        changed_free = _save_library_article_edit(user, context, "無料へ変更", "# 無料本文\n\n本文")
        assert changed_free["request"]["article_type"] == "無料"
        assert next(row for row in user.db.list_articles() if row["article_id"] == target_id)["article_type"] == "無料"
        user.vars["article_type"].set("有料")
        context = _load_library_edit_context(user, changed_free)
        _restore_library_request(user, context)
        user.vars["article_type"].set("有料")
        changed_paid = _save_library_article_edit(user, context, "有料へ変更", "# 有料本文\n\n無料部分\n\n有料部分")
        assert changed_paid["request"]["article_type"] == "有料"
        assert "有料部分" in changed_paid["content"]["web_current"]

        # Explicit image-plan edits update settings while retaining generated metadata.
        context = _load_library_edit_context(user, changed_paid)
        _restore_library_request(user, context)
        user.vars["image_eyecatch_enabled"].set(True)
        user.vars["image_illustrations_enabled"].set(True)
        user.vars["image_count"].set("2")
        user.vars["image_style"].set("ビジネス")
        image_changed = _save_library_article_edit(user, context, "画像計画変更", "# 画像計画変更\n\n## 見出し\n\n本文")
        sidecar = user.web_ai_bridge.workflow.image_store.load_payload(target_id)
        assert sidecar["image_settings"]["illustration_count"] == "2"
        assert sidecar["image_settings"]["style"] == "business"
        assert sidecar["custom_metadata"] == {"must_survive": True}
        assert sidecar["assets"][0]["id"] == "cover-1"
        assert len(sidecar["items"]) == 3
        assert image_changed["article_id"] == target_id
        assert user.web_ai_bridge.current_snapshot()["is_completed"] is True

        # 13: different user DB cannot load or update the article.
        assert admin.db.list_articles() == []
        try:
            _save_library_article_edit(admin, context, "cross user", "# blocked")
        except RuntimeError:
            pass
        else:
            raise AssertionError("cross-user local article update unexpectedly succeeded")

        # 14-15: a fresh DB/workflow instance sees edits and image articles.
        restarted = App(root / "AAS-000002")
        restarted_payload = restarted.db.load(target_id)
        assert restarted_payload["title"] == "画像計画変更"
        assert target_id in ids(restarted)
        restarted_context = _load_library_edit_context(restarted, restarted_payload)
        assert restarted_context["image_settings"]["illustration_count"] == "2"
        assert restarted_context["image_payload"]["custom_metadata"]["must_survive"] is True
        assert admin.db.list_articles() == []

    print("PHASE4_ARTICLE_LIBRARY_REEDIT: PASS")


if __name__ == "__main__":
    main()
