from __future__ import annotations

import argparse
import pathlib
import sys
import time
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import (  # noqa: E402
    AuthSession,
    AuthenticatedUser,
    ManagedUserProfile,
    UserProfile,
)
from ai_article_studio.ui import auth_ui  # noqa: E402
from ai_article_studio.ui.auth_ui import RoleShell  # noqa: E402


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.geometry("1400x900")


class FakeAdminService:
    def __init__(self):
        self.users = [
            ManagedUserProfile("pending-id", "AAS-000002", "承認待ちユーザー", "user", "pending", "2026-08-24T00:00:00Z"),
            ManagedUserProfile("admin-id", "AAS-000001", "管理者", "admin", "active", "2026-08-23T00:00:00Z"),
            ManagedUserProfile("active-id", "AAS-000003", "利用中ユーザー", "user", "active", "2026-08-23T01:00:00Z"),
            ManagedUserProfile("paused-id", "AAS-000004", "停止ユーザー", "user", "suspended", "2026-08-23T02:00:00Z"),
        ]
        self.changes: list[tuple[str, str]] = []

    def admin_list_users(self, _actor, aas_user_id=""):
        if aas_user_id:
            return [user for user in self.users if user.aas_user_id == aas_user_id]
        return list(self.users)

    def admin_set_user_status(self, _actor, target, new_status):
        self.changes.append((target.aas_user_id, new_status))
        updated = ManagedUserProfile(target.id, target.aas_user_id, target.display_name, target.role, new_status, target.created_at)
        self.users = [updated if user.id == target.id else user for user in self.users]
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


def text_widgets(widget):
    values = []
    for item in walk(widget):
        try:
            values.append((item, str(item.cget("text") or "")))
        except tk.TclError:
            pass
    return values


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
        print("V0.4.3.5 ADMIN USER MANAGEMENT TK TEST SKIPPED: display unavailable")
        return
    original_ask = auth_ui.messagebox.askyesno
    original_info = auth_ui.messagebox.showinfo
    try:
        auth_ui.messagebox.askyesno = lambda *_args, **_kwargs: True
        auth_ui.messagebox.showinfo = lambda *_args, **_kwargs: None
        admin = authenticated()
        service = FakeAdminService()
        shell = RoleShell(app, admin.profile, lambda: None, service=service, current_user=admin, run_async=immediate)
        shell.start()
        shell.navigate("users")
        app.update_idletasks()
        values = text_widgets(shell.placeholder)
        texts = {text for _widget, text in values}
        for expected in ("ユーザー管理", "AAS-000002", "承認待ち", "利用中", "一時停止", "承認", "停止", "再開", "ログイン中"):
            assert expected in texts, expected
        approve = next(widget for widget, text in values if text == "承認")
        approve.invoke()
        app.update_idletasks()
        assert service.changes == [("AAS-000002", "active")]

        user = authenticated("user", "active", "user-id", "AAS-000009")
        user_shell = RoleShell(app, user.profile, lambda: None, service=service, current_user=user, run_async=immediate)
        user_shell.start()
        user_shell.navigate("users")
        app.update_idletasks()
        denied = {text for _widget, text in text_widgets(user_shell.placeholder)}
        assert "アクセスできません" in denied
        assert "AAS-000002" not in denied
        user_shell.destroy()
        shell.destroy()
    finally:
        auth_ui.messagebox.askyesno = original_ask
        auth_ui.messagebox.showinfo = original_info
        app.destroy()
    print("V0.4.3.5 ADMIN USER MANAGEMENT TK RUNTIME TEST OK")


if __name__ == "__main__":
    main()
