from __future__ import annotations

import threading
import tkinter as tk
from tkinter import messagebox
import webbrowser

from ..core.auth_service import (
    AuthConfigurationError,
    AuthError,
    AuthenticatedUser,
    SupabaseAuthService,
    UserProfile,
    build_auth_service,
)


BG = "#0B1020"
SIDEBAR = "#080D19"
SURFACE = "#111827"
SURFACE_2 = "#151C2F"
SURFACE_3 = "#1C2942"
LINE = "#2A3A59"
TEXT = "#F8FAFC"
SOFT = "#CBD5E1"
MUTED = "#8FA2C4"
PURPLE = "#8B5CF6"
PURPLE_DARK = "#6D28D9"
BLUE = "#38BDF8"
GREEN = "#34D399"
RED = "#F87171"

AI_NOTICE = (
    "※ AI生成機能の一部は、ユーザー自身のAIサービス\n"
    "（ChatGPT・API・ローカルAI等）を利用します。\n"
    "利用枠・料金は各提供元の条件に従います。"
)

AI_DETAIL = (
    "AI Article Studioは、記事設計やプロンプト作成などを支援します。\n\n"
    "・ChatGPTなどのWeb AI、各社API、ローカルAIは、それぞれの提供元のアカウント・利用枠・料金・利用規約が適用されます。\n"
    "・AIの出力には誤りや古い情報が含まれる場合があります。公開前に、事実・権利・表現・リンクを必ず確認してください。\n"
    "・個人情報、機密情報、第三者の秘密情報を、必要なくAIサービスへ送信しないでください。\n"
    "・医療、法律、投資など高い正確性が必要な内容は、専門家や一次情報で確認してください。\n"
    "・生成物の公開・利用に関する最終判断と責任は利用者にあります。"
)

USER_MENU = (
    ("⌂", "ホーム", "home"),
    ("✦", "記事作成", "create"),
    ("◈", "SNS告知", "sns"),
    ("◆", "ブランド管理", "brands"),
    ("▤", "記事ライブラリ", "library"),
    ("⚙", "設定", "settings"),
    ("?", "サポート", "support"),
)

ADMIN_MENU = (
    ("⌂", "ダッシュボード", "dashboard"),
    ("◉", "ユーザー管理", "users"),
    ("▤", "記事管理", "articles"),
    ("◆", "ブランド管理", "brands"),
    ("◈", "SNS告知管理", "sns_admin"),
    ("⚑", "Feature Flags", "feature_flags"),
    ("◇", "ライセンス", "licenses"),
    ("✉", "問い合わせ", "inquiries"),
    ("!", "要望/不具合", "feedback"),
    ("↻", "アップデート", "updates"),
    ("＋", "診断", "diagnostics"),
    ("≡", "ログ", "logs"),
    ("▣", "バックアップ", "backups"),
    ("⚙", "設定", "settings"),
)


def _font(size: int = 10, weight: str = "normal") -> tuple[str, int, str]:
    return ("Yu Gothic UI", size, weight)


def _label(parent: tk.Misc, text: str, *, size: int = 10, color: str = TEXT, bg: str = SURFACE, weight: str = "normal", **kwargs):
    return tk.Label(parent, text=text, font=_font(size, weight), fg=color, bg=bg, **kwargs)


def _button(parent: tk.Misc, text: str, command, *, primary: bool = True, **kwargs):
    return tk.Button(
        parent,
        text=text,
        command=command,
        font=_font(10, "bold"),
        fg=TEXT,
        bg=PURPLE_DARK if primary else SURFACE_3,
        activeforeground=TEXT,
        activebackground=PURPLE if primary else LINE,
        relief="flat",
        bd=0,
        cursor="hand2",
        padx=18,
        pady=10,
        **kwargs,
    )


def _entry(parent: tk.Misc, textvariable: tk.Variable, *, show: str = ""):
    return tk.Entry(
        parent,
        textvariable=textvariable,
        show=show,
        font=_font(11),
        fg=TEXT,
        bg=SURFACE_3,
        insertbackground=TEXT,
        selectbackground=PURPLE_DARK,
        relief="flat",
        bd=0,
        highlightthickness=1,
        highlightbackground=LINE,
        highlightcolor=PURPLE,
    )


class AuthUIController:
    def __init__(self, app: tk.Misc):
        self.app = app
        self.auth_frame: tk.Frame | None = None
        self.role_shell: RoleShell | None = None
        self.current_user: AuthenticatedUser | None = None
        self.busy = False
        self.service: SupabaseAuthService | None = None
        self.config_error = ""
        try:
            self.service = build_auth_service()
        except AuthConfigurationError as exc:
            self.config_error = str(exc)

    def start(self) -> None:
        if self.service is not None and self.service.config.enabled and self.service.session_store.load() is not None:
            self.show_login(status="ログイン状態を確認しています…")
            self._run_async(self.service.restore, self._on_restore)
        else:
            self.show_login()

    def show_login(self, status: str = "") -> None:
        self._replace_auth_frame()
        frame = self.auth_frame
        assert frame is not None
        self._brand_panel(frame, "WELCOME BACK", "AI Article Studioへログイン")
        card = tk.Frame(frame, bg=SURFACE, highlightthickness=1, highlightbackground=LINE)
        card.place(relx=0.66, rely=0.5, anchor="center", width=510, height=680)
        _label(card, "ログイン", size=24, weight="bold").pack(anchor="w", padx=44, pady=(38, 4))
        _label(card, "記事作成環境と履歴へ安全にアクセスします", size=9, color=MUTED).pack(anchor="w", padx=44, pady=(0, 24))

        email = tk.StringVar()
        password = tk.StringVar()
        _label(card, "Email", size=9, color=SOFT).pack(anchor="w", padx=44)
        _entry(card, email).pack(fill="x", padx=44, pady=(6, 16), ipady=10)
        _label(card, "Password", size=9, color=SOFT).pack(anchor="w", padx=44)
        _entry(card, password, show="•").pack(fill="x", padx=44, pady=(6, 8), ipady=10)

        links = tk.Frame(card, bg=SURFACE)
        links.pack(fill="x", padx=44)
        self._link(links, "パスワードを忘れた方", lambda: self._reset_password(email.get())).pack(side="right")

        status_var = tk.StringVar(value=status or self.config_error)
        status_label = _label(card, "", size=9, color=RED, wraplength=420, justify="left")
        status_label.configure(textvariable=status_var)
        status_label.pack(fill="x", padx=44, pady=(10, 4))

        def submit() -> None:
            value_email = email.get().strip()
            value_password = password.get()
            if not value_email or not value_password:
                status_var.set("EmailとPasswordを入力してください。")
                return
            if self.service is None or not self.service.config.enabled:
                status_var.set(self.config_error or "Supabase Authがまだ設定されていません。")
                return
            password.set("")
            status_var.set("ログインしています…")
            self._run_async(
                lambda: self.service.sign_in_with_password(value_email, value_password),
                lambda result, exc: self._finish_login(result, exc, status_var),
            )

        _button(card, "ログイン", submit).pack(fill="x", padx=44, pady=(8, 10))
        _button(card, "G  Googleでログイン", lambda: self._google_login(status_var), primary=False).pack(fill="x", padx=44)
        self._link(card, "新規登録はこちら", self.show_signup).pack(pady=(14, 8))

        notice = tk.Frame(card, bg=SURFACE_2, highlightthickness=1, highlightbackground=LINE)
        notice.pack(fill="x", padx=44, pady=(5, 0))
        _label(notice, AI_NOTICE, size=8, color=SOFT, bg=SURFACE_2, justify="left").pack(anchor="w", padx=12, pady=(9, 2))
        self._link(notice, "AIの利用について詳しく見る", lambda: self._show_text("AIの利用について", AI_DETAIL), bg=SURFACE_2).pack(anchor="w", padx=8, pady=(0, 8))

        if self.service is not None and not self.service.config.enabled and not self.service.config.required:
            _button(card, "既存のローカルモードで続ける", self._continue_local, primary=False).pack(fill="x", padx=44, pady=(12, 0))

        self.app.bind("<Return>", lambda _event: submit(), add="+")

    def show_signup(self) -> None:
        self._replace_auth_frame()
        frame = self.auth_frame
        assert frame is not None
        self._brand_panel(frame, "CREATE ACCOUNT", "AI Article Studioを始める")
        card = tk.Frame(frame, bg=SURFACE, highlightthickness=1, highlightbackground=LINE)
        card.place(relx=0.66, rely=0.5, anchor="center", width=620, height=820)
        _label(card, "新規登録", size=22, weight="bold").pack(anchor="w", padx=42, pady=(28, 3))
        _label(card, "登録後も既存の記事・設定はそのまま利用できます", size=9, color=MUTED).pack(anchor="w", padx=42, pady=(0, 16))

        email = tk.StringVar()
        display_name = tk.StringVar()
        password = tk.StringVar()
        confirm = tk.StringVar()
        for caption, variable, hidden in (
            ("Email", email, False),
            ("表示名（任意）", display_name, False),
            ("Password（8文字以上）", password, True),
            ("Password確認", confirm, True),
        ):
            _label(card, caption, size=8, color=SOFT).pack(anchor="w", padx=42)
            _entry(card, variable, show="•" if hidden else "").pack(fill="x", padx=42, pady=(4, 9), ipady=8)

        detail = tk.Frame(card, bg=SURFACE_2, highlightthickness=1, highlightbackground=LINE)
        detail.pack(fill="x", padx=42, pady=(5, 8))
        _label(detail, "AI利用条件（登録前にご確認ください）", size=9, color=BLUE, bg=SURFACE_2, weight="bold").pack(anchor="w", padx=12, pady=(8, 2))
        _label(detail, AI_DETAIL, size=7, color=SOFT, bg=SURFACE_2, justify="left", wraplength=500).pack(anchor="w", padx=12, pady=(0, 8))

        accepted_terms = tk.BooleanVar(value=False)
        accepted_privacy = tk.BooleanVar(value=False)
        accepted_ai = tk.BooleanVar(value=False)
        self._consent_row(card, accepted_terms, "利用規約に同意する", "terms").pack(fill="x", padx=42)
        self._consent_row(card, accepted_privacy, "プライバシーポリシーに同意する", "privacy").pack(fill="x", padx=42)
        self._consent_row(card, accepted_ai, "AI利用条件を確認し同意する", "ai").pack(fill="x", padx=42)

        status_var = tk.StringVar(value=self.config_error)
        status = _label(card, "", size=8, color=RED, wraplength=520, justify="left")
        status.configure(textvariable=status_var)
        status.pack(fill="x", padx=42, pady=(5, 2))

        def submit() -> None:
            if self.service is None or not self.service.config.enabled:
                status_var.set(self.config_error or "Supabase Authがまだ設定されていません。")
                return
            if not email.get().strip() or not password.get():
                status_var.set("EmailとPasswordを入力してください。")
                return
            if len(password.get()) < 8:
                status_var.set("Passwordは8文字以上で入力してください。")
                return
            if password.get() != confirm.get():
                status_var.set("Password確認が一致しません。")
                return
            if not all((accepted_terms.get(), accepted_privacy.get(), accepted_ai.get())):
                status_var.set("3つの確認項目すべてへの同意が必要です。")
                return
            value_password = password.get()
            password.set("")
            confirm.set("")
            status_var.set("アカウントを作成しています…")
            self._run_async(
                lambda: self.service.sign_up(email.get(), value_password, display_name.get()),
                lambda result, exc: self._finish_signup(result, exc, status_var),
            )

        _button(card, "登録する", submit).pack(fill="x", padx=42, pady=(4, 6))
        self._link(card, "ログイン画面へ戻る", self.show_login).pack(pady=(4, 0))

    def _brand_panel(self, frame: tk.Frame, eyebrow: str, title: str) -> None:
        panel = tk.Frame(frame, bg=SIDEBAR)
        panel.place(relx=0, rely=0, relwidth=0.36, relheight=1)
        _label(panel, "✦  AI ARTICLE", size=20, weight="bold", bg=SIDEBAR).place(relx=0.12, rely=0.16)
        _label(panel, "STUDIO", size=10, color=BLUE, bg=SIDEBAR).place(relx=0.12, rely=0.205)
        _label(panel, eyebrow, size=8, color=PURPLE, bg=SIDEBAR, weight="bold").place(relx=0.12, rely=0.42)
        _label(panel, title, size=22, bg=SIDEBAR, weight="bold", justify="left", wraplength=330).place(relx=0.12, rely=0.46)
        _label(panel, "ダークネイビー＋紫＋青の共通UIで、\nUser/Adminの機能を安全に分離します。", size=9, color=MUTED, bg=SIDEBAR, justify="left").place(relx=0.12, rely=0.56)

    def _replace_auth_frame(self) -> None:
        if self.role_shell is not None:
            self.role_shell.destroy()
            self.role_shell = None
        if self.auth_frame is not None:
            self.auth_frame.destroy()
        self.auth_frame = tk.Frame(self.app, bg=BG)
        self.auth_frame.place(x=0, y=0, relwidth=1, relheight=1)
        self.auth_frame.lift()

    def _link(self, parent: tk.Misc, text: str, command, *, bg: str = SURFACE):
        return tk.Button(
            parent,
            text=text,
            command=command,
            font=_font(8, "normal"),
            fg=BLUE,
            bg=bg,
            activeforeground="#7DD3FC",
            activebackground=bg,
            relief="flat",
            bd=0,
            cursor="hand2",
            padx=4,
            pady=2,
        )

    def _consent_row(self, parent: tk.Misc, variable: tk.BooleanVar, text: str, kind: str):
        row = tk.Frame(parent, bg=SURFACE)
        tk.Checkbutton(
            row,
            variable=variable,
            bg=SURFACE,
            activebackground=SURFACE,
            selectcolor=PURPLE_DARK,
            fg=TEXT,
            activeforeground=TEXT,
            bd=0,
        ).pack(side="left")
        _label(row, text, size=8).pack(side="left")
        self._link(row, "内容を見る", lambda: self._open_legal(kind)).pack(side="left", padx=(4, 0))
        return row

    def _open_legal(self, kind: str) -> None:
        config = self.service.config if self.service is not None else None
        url = {
            "terms": getattr(config, "terms_url", ""),
            "privacy": getattr(config, "privacy_url", ""),
            "ai": getattr(config, "ai_terms_url", ""),
        }.get(kind, "")
        if url:
            webbrowser.open(url)
            return
        title, text = {
            "terms": ("利用規約", "正式な利用規約URLは管理者設定から登録されます。登録前に運営者が公開した最新版をご確認ください。"),
            "privacy": ("プライバシーポリシー", "正式なプライバシーポリシーURLは管理者設定から登録されます。認証情報はSupabase Authで処理し、Passwordをアプリへ保存しません。"),
            "ai": ("AI利用条件", AI_DETAIL),
        }[kind]
        self._show_text(title, text)

    def _show_text(self, title: str, text: str) -> None:
        win = tk.Toplevel(self.app)
        win.title(title)
        win.configure(bg=BG)
        win.geometry("640x520")
        win.transient(self.app)
        _label(win, title, size=18, weight="bold", bg=BG).pack(anchor="w", padx=28, pady=(24, 8))
        box = tk.Text(win, wrap="word", font=_font(10), fg=TEXT, bg=SURFACE, insertbackground=TEXT, relief="flat", padx=16, pady=14)
        box.pack(fill="both", expand=True, padx=28, pady=(0, 12))
        box.insert("1.0", text)
        box.configure(state="disabled")
        _button(win, "閉じる", win.destroy, primary=False).pack(anchor="e", padx=28, pady=(0, 22))

    def _reset_password(self, email: str) -> None:
        value = email.strip()
        if not value:
            messagebox.showinfo("パスワードリセット", "先にEmailを入力してください。")
            return
        if self.service is None or not self.service.config.enabled:
            messagebox.showerror("パスワードリセット", self.config_error or "Supabase Authが未設定です。")
            return
        self._run_async(
            lambda: self.service.request_password_reset(value),
            lambda _result, exc: messagebox.showerror("パスワードリセット", str(exc)) if exc else messagebox.showinfo("パスワードリセット", "再設定メールを送信しました。"),
        )

    def _google_login(self, status_var: tk.StringVar) -> None:
        if self.service is None or not self.service.config.enabled:
            status_var.set(self.config_error or "Supabase Authがまだ設定されていません。")
            return
        accepted = messagebox.askyesno(
            "Googleログイン",
            "Googleログインを続ける前に、利用規約・プライバシーポリシー・AI利用条件を確認し、同意してください。\n\n同意してブラウザーを開きますか？",
        )
        if not accepted:
            return
        status_var.set("ブラウザーでGoogleログインを完了してください…")
        self._run_async(
            lambda: self.service.sign_in_with_google(webbrowser.open),
            lambda result, exc: self._finish_login(result, exc, status_var),
        )

    def _finish_login(self, result, exc: Exception | None, status_var: tk.StringVar) -> None:
        if exc:
            status_var.set(self._friendly_error(exc))
            return
        if not isinstance(result, AuthenticatedUser):
            status_var.set("ログイン結果を確認できません。")
            return
        self._enter_application(result)

    def _finish_signup(self, result, exc: Exception | None, status_var: tk.StringVar) -> None:
        if exc:
            status_var.set(self._friendly_error(exc))
            return
        if result.authenticated is not None:
            self._enter_application(result.authenticated)
            return
        status_var.set("確認メールを送信しました。メール内のリンクを確認してからログインしてください。")
        messagebox.showinfo("新規登録", status_var.get())
        self.show_login()

    def _on_restore(self, result, exc: Exception | None) -> None:
        if exc or result is None:
            self.show_login()
            return
        self._enter_application(result)

    def _continue_local(self) -> None:
        self._enter_profile(UserProfile.local_user())

    def _enter_application(self, user: AuthenticatedUser) -> None:
        self.current_user = user
        self._enter_profile(user.profile)

    def _enter_profile(self, profile: UserProfile) -> None:
        if self.auth_frame is not None:
            self.auth_frame.destroy()
            self.auth_frame = None
        self.role_shell = RoleShell(self.app, profile, self.logout)
        self.role_shell.start()

    def logout(self) -> None:
        user = self.current_user
        self.current_user = None
        if self.role_shell is not None:
            self.role_shell.destroy()
            self.role_shell = None
        self.show_login(status="ログアウトしました。")
        if self.service is not None:
            self.service.session_store.clear()
            if user is not None:
                threading.Thread(target=lambda: self.service.sign_out(user.session), daemon=True).start()

    def _run_async(self, operation, callback) -> None:
        if self.busy:
            return
        self.busy = True

        def worker() -> None:
            result = None
            caught: Exception | None = None
            try:
                result = operation()
            except Exception as exc:  # UI boundary: convert service errors to a status message
                caught = exc

            def finish() -> None:
                self.busy = False
                callback(result, caught)

            try:
                self.app.after(0, finish)
            except tk.TclError:
                return

        threading.Thread(target=worker, daemon=True).start()

    @staticmethod
    def _friendly_error(exc: Exception) -> str:
        if isinstance(exc, (AuthError, AuthConfigurationError)):
            return str(exc)
        return "処理を完了できませんでした。時間を置いて再度お試しください。"


class RoleShell:
    ROUTES = {
        "home": ("show_home",),
        "create": ("show_create",),
        "library": ("show_library", "show_articles"),
        "settings": ("show_settings",),
    }

    def __init__(self, app: tk.Misc, profile: UserProfile, logout):
        self.app = app
        self.profile = profile
        self.logout = logout
        self.sidebar: tk.Frame | None = None
        self.placeholder: tk.Frame | None = None
        self.buttons: dict[str, tk.Button] = {}

    def start(self) -> None:
        self._build_sidebar()
        self.navigate("dashboard" if self.profile.role == "admin" else "home")

    def destroy(self) -> None:
        if self.placeholder is not None:
            self.placeholder.destroy()
            self.placeholder = None
        if self.sidebar is not None:
            self.sidebar.destroy()
            self.sidebar = None

    def _build_sidebar(self) -> None:
        if self.sidebar is not None:
            self.sidebar.destroy()
        self.sidebar = tk.Frame(self.app, bg=SIDEBAR, width=228)
        self.sidebar.place(x=0, y=0, width=228, relheight=1)
        _label(self.sidebar, "✦", size=22, color=PURPLE, bg=SIDEBAR, weight="bold").place(x=24, y=38)
        _label(self.sidebar, "AI ARTICLE", size=13, bg=SIDEBAR, weight="bold").place(x=66, y=39)
        _label(self.sidebar, "ADMIN" if self.profile.role == "admin" else "STUDIO", size=8, color=BLUE, bg=SIDEBAR).place(x=67, y=66)

        menu = ADMIN_MENU if self.profile.role == "admin" else USER_MENU
        menu_frame = tk.Frame(self.sidebar, bg=SIDEBAR)
        menu_frame.place(x=8, y=112, width=212, relheight=0.70)
        for icon, label, route in menu:
            button = tk.Button(
                menu_frame,
                text=f" {icon}  {label}",
                command=lambda value=route: self.navigate(value),
                anchor="w",
                font=_font(9, "normal"),
                fg=SOFT,
                bg=SIDEBAR,
                activeforeground=TEXT,
                activebackground="#26194B",
                relief="flat",
                bd=0,
                cursor="hand2",
                padx=14,
                pady=8 if self.profile.role == "admin" else 12,
            )
            button.pack(fill="x", pady=1)
            self.buttons[route] = button

        account = tk.Frame(self.sidebar, bg=SIDEBAR)
        account.pack(side="bottom", fill="x", padx=16, pady=14)
        _label(account, self.profile.display_name or "ユーザー", size=8, bg=SIDEBAR, weight="bold", anchor="w").pack(fill="x")
        _label(account, self.profile.aas_user_id, size=7, color=MUTED, bg=SIDEBAR, anchor="w").pack(fill="x", pady=(1, 5))
        _button(account, "ログアウト", self.logout, primary=False).pack(fill="x")
        self.sidebar.lift()

    def navigate(self, route: str) -> None:
        for key, button in self.buttons.items():
            active = key == route
            button.configure(bg="#26194B" if active else SIDEBAR, fg=TEXT if active else SOFT)
        method = self._resolve_route(route)
        if method is not None:
            if self.placeholder is not None:
                self.placeholder.destroy()
                self.placeholder = None
            try:
                method()
            except Exception as exc:
                self._show_placeholder("機能を開けませんでした", f"既存画面の呼び出しでエラーが発生しました。\n{type(exc).__name__}")
        else:
            title = next((label for _icon, label, key in (ADMIN_MENU if self.profile.role == "admin" else USER_MENU) if key == route), route)
            subtitle = "このFoundationでは安全な導線のみ用意しています。機能本体は次のPhaseで共通Coreへ接続します。"
            self._show_placeholder(title, subtitle)
        if self.sidebar is not None:
            self.sidebar.lift()

    def _resolve_route(self, route: str):
        for name in self.ROUTES.get(route, ()):
            method = getattr(self.app, name, None)
            if callable(method):
                return method
        return None

    def _show_placeholder(self, title: str, subtitle: str) -> None:
        if self.placeholder is not None:
            self.placeholder.destroy()
        self.placeholder = tk.Frame(self.app, bg=BG)
        self.placeholder.place(x=228, y=0, relwidth=1, relheight=1, width=-228)
        content = tk.Frame(self.placeholder, bg=SURFACE, highlightthickness=1, highlightbackground=LINE)
        content.place(relx=0.5, rely=0.42, anchor="center", width=720, height=300)
        _label(content, "AUTH / UI FOUNDATION", size=8, color=PURPLE, weight="bold").pack(anchor="w", padx=36, pady=(34, 8))
        _label(content, title, size=22, weight="bold").pack(anchor="w", padx=36)
        _label(content, subtitle, size=10, color=SOFT, justify="left", wraplength=640).pack(anchor="w", padx=36, pady=(14, 10))
        _label(content, "既存の記事・履歴・設定・Web AI・画像計画・Updaterには変更を加えていません。", size=8, color=GREEN).pack(anchor="w", padx=36, pady=(10, 0))
        self.placeholder.lift()


def install_auth_foundation(app: tk.Misc) -> AuthUIController:
    current = getattr(app, "_aas_auth_controller", None)
    if isinstance(current, AuthUIController):
        return current
    controller = AuthUIController(app)
    app._aas_auth_controller = controller
    controller.start()
    return controller
