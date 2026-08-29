from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import tempfile

from ai_article_studio.core.auth_service import UserProfile
from ai_article_studio.core.user_data import safe_user_scope, user_data_paths
from ai_article_studio.core.web_ai_state import WebAIWorkflowState
from ai_article_studio.ui.auth_ui import RoleShell, configure_user_local_storage


class _Pipeline:
    def __init__(self):
        self.db = None


class _Variable:
    def __init__(self, value=""):
        self.value = value

    def set(self, value):
        self.value = value


class _App:
    def __init__(self):
        self.db = None
        self.pipeline = _Pipeline()
        self.web_ai_bridge = None
        self.current_record = object()
        self.theme_result = object()
        self.selected_theme_id = _Variable("theme-1")

    def show_history(self):
        return "history"


def _profile(aas_user_id: str) -> UserProfile:
    return UserProfile(
        id=f"uuid-{aas_user_id}",
        aas_user_id=aas_user_id,
        display_name=aas_user_id,
        role="admin" if aas_user_id == "AAS-000001" else "user",
        status="active",
        created_at="",
    )


def _article(article_id: str, title: str) -> dict:
    return {
        "article_id": article_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "draft",
        "title": title,
        "theme": title,
        "request": {
            "platform": "note",
            "genre": "test",
            "article_type": "free",
        },
        "cost_actual": {"total_jpy": 0},
    }


def main() -> None:
    assert safe_user_scope("../../AAS-000002") == "AAS-000002"
    assert safe_user_scope("") == "local"
    assert RoleShell.ROUTES["library"][0] == "show_history"

    with tempfile.TemporaryDirectory() as temp_name:
        data_dir = Path(temp_name) / "data"
        legacy_state = data_dir / "web_ai_workflow_state.json"
        legacy_state.parent.mkdir(parents=True)
        legacy_state.write_text('{"legacy": true}\n', encoding="utf-8")

        app = _App()
        shell = RoleShell(app, _profile("AAS-000002"), lambda: None)
        assert shell._resolve_route("library")() == "history"
        user_paths = configure_user_local_storage(
            app,
            _profile("AAS-000002"),
            data_dir=data_dir,
        )
        assert app.pipeline.db is app.db
        assert app.current_record is None
        assert app.theme_result is None
        assert app.selected_theme_id.value == ""
        assert app._aas_local_data_scope == "AAS-000002"
        assert Path(app._aas_local_data_root) == user_paths.root
        assert user_paths == user_data_paths("AAS-000002", data_dir=data_dir)

        app.db.save(_article("user-article", "User article"))
        app.web_ai_bridge.new_article()
        app.web_ai_bridge.save_editor_draft(
            raw_text="# User draft",
            formatted_text="# User formatted",
        )
        app.web_ai_bridge.set_image_settings(
            {
                "enabled": True,
                "target": "both",
                "mode": "web",
                "style": "anime",
                "illustration_count": "2",
            }
        )
        user_snapshot = app.web_ai_bridge.current_snapshot()
        assert user_snapshot["raw_web_output"] == "# User draft"
        assert user_snapshot["image_settings"]["style"] == "anime"
        user_article_id = user_snapshot["article_id"]

        prompt_state = WebAIWorkflowState.from_dict(user_snapshot)
        prompt_state.selected_title = "User image plan"
        prompt_state.article_request = {
            "platform": "note",
            "article_type": "free",
            "genre": "test",
        }
        prompt_state.formatted_output = (
            "# User image plan\n\n"
            "## First section\n\nFirst section body.\n\n"
            "## Second section\n\nSecond section body."
        )
        app.web_ai_bridge.workflow.state_store.save(prompt_state)
        prompt_bundle = app.web_ai_bridge.build_image_prompts()
        assert prompt_bundle["ready"] is True
        assert prompt_bundle["eyecatch_prompt"]
        assert len(prompt_bundle["illustration_prompts"]) == 2
        app.web_ai_bridge.workflow.image_store.save_payload(
            user_article_id,
            {"assets": [{"role": "eyecatch"}]},
        )

        admin_paths = configure_user_local_storage(
            app,
            _profile("AAS-000001"),
            data_dir=data_dir,
        )
        assert admin_paths.root != user_paths.root
        assert app.db.list_articles() == []
        assert app.web_ai_bridge.history_items() == []
        admin_snapshot = app.web_ai_bridge.current_snapshot()
        assert admin_snapshot["raw_web_output"] == ""
        assert admin_snapshot["article_id"] == ""
        assert app.web_ai_bridge.workflow.image_store.load_payload(user_article_id) == {}

        app.db.save(_article("admin-article", "Admin article"))
        assert [row["article_id"] for row in app.db.list_articles()] == ["admin-article"]

        configure_user_local_storage(
            app,
            _profile("AAS-000002"),
            data_dir=data_dir,
        )
        assert [row["article_id"] for row in app.db.list_articles()] == ["user-article"]
        assert app.web_ai_bridge.current_snapshot()["raw_web_output"] == "# User draft"
        assert app.web_ai_bridge.image_settings_snapshot()["style"] == "anime"
        assert app.web_ai_bridge.workflow.image_store.load_payload(user_article_id)["assets"][0]["role"] == "eyecatch"
        assert legacy_state.read_text(encoding="utf-8") == '{"legacy": true}\n'

    print("PHASE4_WINDOWS_LOCAL_ISOLATION: PASS")


if __name__ == "__main__":
    main()
