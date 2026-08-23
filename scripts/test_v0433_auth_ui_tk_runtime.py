from __future__ import annotations

import argparse
import os
import pathlib
import sys
import tkinter as tk


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from ai_article_studio.core.auth_service import UserProfile  # noqa: E402
from ai_article_studio.ui.auth_ui import AuthUIController, RoleShell, install_auth_foundation  # noqa: E402


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.geometry("1280x860")
        self.last_page = ""
        tk.Frame(self, bg="#0B1020").pack(fill="both", expand=True)

    def show_home(self):
        self.last_page = "home"

    def show_create(self):
        self.last_page = "create"

    def show_library(self):
        self.last_page = "library"

    def show_settings(self):
        self.last_page = "settings"


def walk(widget):
    yield widget
    for child in widget.winfo_children():
        yield from walk(child)


def texts(widget) -> set[str]:
    values = set()
    for item in walk(widget):
        try:
            value = str(item.cget("text") or "")
        except tk.TclError:
            continue
        if value:
            values.add(value)
    return values


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-display", action="store_true")
    args = parser.parse_args()
    for name in ("AAS_SUPABASE_URL", "AAS_SUPABASE_ANON_KEY", "AAS_AUTH_REQUIRED"):
        os.environ.pop(name, None)
    try:
        app = App()
    except tk.TclError as exc:
        if args.require_display:
            raise RuntimeError(f"Tk runtime is required but unavailable: {exc}") from exc
        print("V0.4.3.3 AUTH UI TK TEST SKIPPED: display unavailable")
        return
    try:
        controller = install_auth_foundation(app)
        app.update_idletasks()
        login_text = texts(controller.auth_frame)
        for expected in ("ログイン", "G  Googleでログイン", "パスワードを忘れた方", "新規登録はこちら"):
            assert expected in login_text
        controller.show_signup()
        app.update_idletasks()
        signup_text = texts(controller.auth_frame)
        for expected in ("新規登録", "Email", "表示名（任意）", "Password（8文字以上）", "Password確認"):
            assert expected in signup_text

        controller._enter_profile(UserProfile.local_user())
        app.update_idletasks()
        assert app.last_page == "home"
        user_text = texts(controller.role_shell.sidebar)
        for expected in (" ⌂  ホーム", " ✦  記事作成", " ◈  SNS告知", " ◆  ブランド管理", " ▤  記事ライブラリ", " ⚙  設定", " ?  サポート"):
            assert expected in user_text

        controller.role_shell.destroy()
        admin = UserProfile("id", "AAS-ADMIN", "管理者", "admin", "active", "")
        shell = RoleShell(app, admin, lambda: None)
        shell.start()
        app.update_idletasks()
        admin_text = texts(shell.sidebar)
        for expected in (" ⌂  ダッシュボード", " ◉  ユーザー管理", " ⚑  Feature Flags", " ▣  バックアップ"):
            assert expected in admin_text
        shell.destroy()
    finally:
        app.destroy()
    print("V0.4.3.3 AUTH UI TK RUNTIME TEST OK")


if __name__ == "__main__":
    main()
