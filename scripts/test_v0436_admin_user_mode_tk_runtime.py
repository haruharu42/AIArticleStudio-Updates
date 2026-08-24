from __future__ import annotations

import argparse
import pathlib
import sys
import time
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import AuthSession, AuthenticatedUser, ManagedUserProfile, UserProfile  # noqa: E402
from ai_article_studio.ui import auth_ui  # noqa: E402
from ai_article_studio.ui.auth_ui import RoleShell  # noqa: E402


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.geometry("1100x760")
        self.opened: list[str] = []

    def show_home(self):
        self.opened.append("home")

    def show_create(self):
        self.opened.append("create")


class FakeAdminService:
    def __init__(self):
        self.users = [
            ManagedUserProfile("pending-id", "AAS-000002", "haru", "user", "pending", "2026-08-24T00:00:00Z"),
            ManagedUserProfile("admin-id", "AAS-000001", "管理者", "admin", "active", "2026-08-23T00:00:00Z"),
            ManagedUserProfile("active-id", "AAS-000003", "利用中", "user", "active", "2026-08-23T01:00:00Z"),
            ManagedUserProfile("paused-id", "AAS-000004", "停止中", "user", "suspended", "2026-08-23T02:00:00Z"),
        ]
        self.changes: list[tuple[str, str]] = []

    def admin_list_users(self, _actor, aas_user_id=""):
        return [item for item in self.users if not aas_user_id or item.aas_user_id == aas_user_id]

    def admin_set_user_status(self, _actor, target, new_status):
        self.changes.append((target.aas_user_id, new_status))
        updated = ManagedUserProfile(target.id, target.aas_user_id, target.display_name, target.role, new_status, target.created_at)
        self.users = [updated if item.id == target.id else item for item in self.users]
        return updated


def authenticated(role="admin", status="active", user_id="admin-id", aas_id="AAS-000001"):
    return AuthenticatedUser(
        AuthSession("access", "refresh", time.time() + 3600, user_id, "user@example.com"),
        UserProfile(user_id, aas_id, "管理者", role, status, ""),
    )


def walk(widget):
    yield widget
    for child in widget.winfo_children():
        yield from walk(child)


def widget_text(widget) -> str:
    try:
        return str(widget.cget("text") or "")
    except tk.TclError:
        return ""


def texts(widget) -> set[str]:
    return {widget_text(item) for item in walk(widget)}


def row_button(root, aas_id: str, caption: str) -> tk.Button:
    for frame in (item for item in walk(root) if isinstance(item, tk.Frame)):
        values = texts(frame)
        if aas_id in values and caption in values:
            return next(item for item in walk(frame) if isinstance(item, tk.Button) and widget_text(item) == caption)
    raise AssertionError(f"{aas_id} row button not found: {caption}")


def assert_visible(widget: tk.Widget, app: tk.Tk) -> None:
    app.update_idletasks()
    assert widget.winfo_ismapped(), widget_text(widget)
    assert widget.winfo_width() > 1
    left = widget.winfo_rootx()
    right = left + widget.winfo_width()
    assert left >= app.winfo_rootx()
    assert right <= app.winfo_rootx() + app.winfo_width(), (widget_text(widget), right, app.winfo_width())


def immediate(operation, callback):
    try:
        callback(operation(), None)
    except Exception as exc:
        callback(None, exc)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-display", action="store_true")
    args = parser.parse_args()
    try:
        app = App()
    except tk.TclError as exc:
        if args.require_display:
            raise RuntimeError(f"Tk runtime is required but unavailable: {exc}") from exc
        print("V0.4.3.6 ADMIN USER MODE TK TEST SKIPPED: display unavailable")
        return

    original_ask = auth_ui.messagebox.askyesno
    original_info = auth_ui.messagebox.showinfo
    try:
        auth_ui.messagebox.askyesno = lambda *_args, **_kwargs: True
        auth_ui.messagebox.showinfo = lambda *_args, **_kwargs: None
        admin = authenticated()
        original_role = admin.profile.role
        service = FakeAdminService()
        shell = RoleShell(app, admin.profile, lambda: None, service=service, current_user=admin, run_async=immediate)
        shell.start()
        shell.navigate("users")
        app.update()

        approve = row_button(shell.placeholder, "AAS-000002", "承認")
        stop = row_button(shell.placeholder, "AAS-000003", "停止")
        reactivate = row_button(shell.placeholder, "AAS-000004", "再開")
        for button in (approve, stop, reactivate):
            assert_visible(button, app)
        assert "ログイン中" in texts(shell.placeholder)

        approve.invoke()
        app.update()
        assert service.changes[-1] == ("AAS-000002", "active")
        assert row_button(shell.placeholder, "AAS-000002", "停止")
        stop = row_button(shell.placeholder, "AAS-000003", "停止")
        stop.invoke()
        app.update()
        assert row_button(shell.placeholder, "AAS-000003", "再開")
        row_button(shell.placeholder, "AAS-000003", "再開").invoke()
        app.update()
        assert row_button(shell.placeholder, "AAS-000003", "停止")

        mode_button = next(item for item in walk(shell.sidebar) if isinstance(item, tk.Button) and widget_text(item) == "ユーザーモードへ")
        mode_button.invoke()
        app.update()
        assert shell.ui_mode == "user"
        assert admin.profile.role == original_role == "admin"
        assert "ADMIN USER MODE" in texts(shell.sidebar)
        assert "管理者モードへ" in texts(shell.sidebar)
        assert "ユーザー管理" not in texts(shell.sidebar)
        shell.navigate("create")
        assert app.opened[-1] == "create"
        shell.navigate("users")
        assert "アクセスできません" in texts(shell.placeholder)
        next(item for item in walk(shell.sidebar) if isinstance(item, tk.Button) and widget_text(item) == "管理者モードへ").invoke()
        app.update()
        assert shell.ui_mode == "admin"
        assert admin.profile.role == "admin"
        if sys.platform == "win32":
            app.state("zoomed")
            shell.navigate("users")
            app.update()
            for aas_id, caption in (("AAS-000002", "停止"), ("AAS-000003", "停止"), ("AAS-000004", "再開")):
                assert_visible(row_button(shell.placeholder, aas_id, caption), app)

        user = authenticated("user", "active", "user-id", "AAS-000009")
        user_shell = RoleShell(app, user.profile, lambda: None, service=service, current_user=user, run_async=immediate)
        user_shell.start()
        app.update()
        assert user_shell.ui_mode == "user"
        assert "管理者モードへ" not in texts(user_shell.sidebar)
        assert "ユーザー管理" not in texts(user_shell.sidebar)
        user_shell.navigate("users")
        assert "アクセスできません" in texts(user_shell.placeholder)
        user_shell.destroy()
        shell.destroy()
    finally:
        auth_ui.messagebox.askyesno = original_ask
        auth_ui.messagebox.showinfo = original_info
        app.destroy()
    print("V0.4.3.6 ADMIN USER MODE TK RUNTIME TEST OK")


if __name__ == "__main__":
    main()
