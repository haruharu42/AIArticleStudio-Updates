from __future__ import annotations

import tkinter as tk
from tkinter import messagebox, ttk


BG = "#07101F"
SURFACE = "#0E1A2E"
SURFACE_2 = "#111E34"
SURFACE_3 = "#16243C"
LINE = "#2A3A59"
PURPLE = "#7C3AED"
PURPLE_2 = "#A855F7"
TEXT = "#F8FAFC"
SOFT = "#CBD5E1"
MUTED = "#8391A8"
GREEN = "#22C55E"

STEP_LABELS = (
    "生成方法",
    "画像計画",
    "基本設定",
    "記事設計",
    "作成",
    "完了",
)


def _label(parent, text, size=9, bold=False, fg=TEXT, bg=None, **kwargs):
    return tk.Label(
        parent,
        text=text,
        font=("Yu Gothic UI", size, "bold" if bold else "normal"),
        fg=fg,
        bg=bg or str(parent.cget("bg")),
        **kwargs,
    )


def _primary(app, parent, text, command):
    try:
        return app._primary_button(parent, text, command)
    except Exception:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=PURPLE,
            fg=TEXT,
            activebackground=PURPLE_2,
            activeforeground=TEXT,
            relief="flat",
            padx=20,
            pady=10,
            cursor="hand2",
        )


def _secondary(app, parent, text, command):
    try:
        return app._secondary_button(parent, text, command)
    except Exception:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=SURFACE_3,
            fg=TEXT,
            activebackground="#223454",
            activeforeground=TEXT,
            relief="flat",
            padx=16,
            pady=9,
            cursor="hand2",
        )


def _hide(widget):
    try:
        manager = widget.winfo_manager()
        if manager == "pack":
            widget.pack_forget()
        elif manager == "grid":
            widget.grid_remove()
        elif manager == "place":
            widget.place_forget()
    except Exception:
        pass


def _descendant_text(widget):
    values = []
    try:
        if str(widget.winfo_class()) in {
            "Label", "TLabel", "Button", "TButton", "Checkbutton", "TCheckbutton", "Radiobutton"
        }:
            value = str(widget.cget("text") or "").strip()
            if value:
                values.append(value)
        for child in widget.winfo_children():
            values.extend(_descendant_text(child))
    except Exception:
        pass
    return values


def _find_buttons(widgets):
    found = []
    for widget in widgets:
        try:
            if str(widget.winfo_class()) in {"Button", "TButton"}:
                found.append(widget)
            found.extend(_find_buttons(widget.winfo_children()))
        except Exception:
            pass
    return found


def _var(app, names, default="", boolean=False):
    for name in names:
        value = getattr(app, "vars", {}).get(name)
        if value is not None:
            return value
    key = names[0]
    value = tk.BooleanVar(master=app, value=bool(default)) if boolean else tk.StringVar(master=app, value=str(default))
    app.vars[key] = value
    return value


def _value(variable, default=""):
    try:
        return variable.get()
    except Exception:
        return default


def _card(parent, padx=22, pady=18):
    frame = tk.Frame(parent, bg=SURFACE_2, highlightthickness=1, highlightbackground=LINE)
    frame._content_padx = padx
    frame._content_pady = pady
    return frame


def _heading(parent, title, subtitle):
    _label(parent, title, size=15, bold=True).pack(anchor="w")
    _label(parent, subtitle, size=8, fg=MUTED).pack(anchor="w", pady=(4, 16))


def _build_progress(parent):
    row = tk.Frame(parent, bg=BG)
    row.pack(fill="x", pady=(0, 12))
    items = []
    for index, title in enumerate(STEP_LABELS):
        item = tk.Frame(row, bg=BG, highlightthickness=1, highlightbackground=LINE)
        item.pack(side="left", padx=(0, 7))
        label = _label(item, f"{index + 1:02d}  {title}", size=8, fg=SOFT, bg=BG)
        label.pack(padx=13, pady=8)
        items.append((item, label))
    return items


def _update_progress(items, active):
    for index, (frame, label) in enumerate(items):
        if index == active:
            frame.configure(bg="#3A176D", highlightbackground=PURPLE_2)
            label.configure(bg="#3A176D", fg=TEXT)
        elif index < active:
            frame.configure(bg=BG, highlightbackground="#55427B")
            label.configure(bg=BG, fg="#C4B5FD", text=f"{index + 1:02d}  {STEP_LABELS[index]}  ✓")
        else:
            frame.configure(bg=BG, highlightbackground=LINE)
            label.configure(bg=BG, fg=SOFT, text=f"{index + 1:02d}  {STEP_LABELS[index]}")


def _set_combo(parent, label_text, variable, values, row, column, command=None):
    box = tk.Frame(parent, bg=SURFACE_2)
    box.grid(row=row, column=column, sticky="ew", padx=(0 if column == 0 else 10, 10 if column == 0 else 0), pady=7)
    _label(box, label_text, size=8, fg=SOFT).pack(anchor="w", pady=(0, 5))
    combo = ttk.Combobox(box, textvariable=variable, values=values, state="readonly", style="Dark.TCombobox")
    combo.pack(fill="x", ipady=3)
    if command:
        combo.bind("<<ComboboxSelected>>", command)
    return combo


def _history_items(app):
    try:
        return list(app.web_ai_bridge.history_items(10) or [])
    except Exception:
        return []


def _find_sidebar(app):
    def walk(widget):
        for child in widget.winfo_children():
            try:
                if str(child.winfo_class()) in {"Label", "TLabel"} and "AI ASSIST" in str(child.cget("text") or ""):
                    panel = child.master
                    return panel.master if panel is not None else None, panel
            except Exception:
                pass
            result = walk(child)
            if result:
                return result
        return None

    try:
        return walk(app)
    except Exception:
        return None


def _install_history_panel(app, on_load=None, on_delete=None):
    found = _find_sidebar(app)
    if not found:
        return
    sidebar, first_panel = found
    panel = getattr(app, "_v0427_history_panel", None)
    if panel is None or not panel.winfo_exists():
        panel = _card(sidebar)
        try:
            panel.pack(fill="x", pady=(0, 12), before=first_panel)
        except Exception:
            panel.pack(fill="x", pady=(0, 12))
        _label(panel, "最近の作業", size=10, bold=True).pack(anchor="w", padx=14, pady=(12, 0))
        _label(panel, "最大10件", size=7, fg=MUTED).pack(anchor="w", padx=14, pady=(1, 8))
        listing = tk.Frame(panel, bg=SURFACE_2)
        listing.pack(fill="x", padx=9, pady=(0, 10))
        app._v0427_history_panel = panel
        app._v0427_history_list = listing
    listing = app._v0427_history_list
    for child in listing.winfo_children():
        child.destroy()
    items = _history_items(app)
    if not items:
        _label(listing, "履歴はまだありません", size=8, fg=MUTED).pack(anchor="w", padx=5, pady=6)
        return
    for item in items[:4]:
        row = tk.Frame(listing, bg="#0D182A", highlightthickness=1, highlightbackground=LINE)
        row.pack(fill="x", pady=3)
        title = str(item.get("title") or "新しい記事")
        if len(title) > 19:
            title = title[:18] + "…"
        article_id = str(item.get("article_id") or "")
        command = (lambda aid=article_id: on_load(aid)) if on_load else (lambda: None)
        tk.Button(
            row,
            text=title,
            command=command,
            bg="#0D182A",
            fg=TEXT,
            activebackground=SURFACE_3,
            activeforeground=TEXT,
            relief="flat",
            anchor="w",
            cursor="hand2" if on_load else "arrow",
        ).pack(side="left", fill="x", expand=True, padx=5, pady=5)
        if on_delete:
            tk.Button(
                row,
                text="×",
                command=lambda aid=article_id: on_delete(aid),
                bg="#0D182A",
                fg=MUTED,
                activebackground="#7F1D1D",
                activeforeground=TEXT,
                relief="flat",
                cursor="hand2",
            ).pack(side="right", padx=4)


def _generation_page(app, parent, generation_var):
    card = _card(parent)
    inner = tk.Frame(card, bg=SURFACE_2)
    inner.pack(fill="both", expand=True, padx=22, pady=20)
    _heading(inner, "生成方法を選択", "最初に記事の作り方を選んでください")
    choices = tk.Frame(inner, bg=SURFACE_2)
    choices.pack(fill="x")
    cards = []
    specs = (
        ("Web版AIで作成", "おすすめ", "API料金なし・コピーして作成"),
        ("OpenAI APIで作成", "", "アプリ内で自動生成"),
        ("プロンプトを書き出す", "", "あとで自由に利用"),
    )

    def select(value):
        generation_var.set(value)
        app._article_generation_method = value
        refresh()

    for index, (title, badge, description) in enumerate(specs):
        option = tk.Frame(choices, bg=SURFACE_3, highlightthickness=1, highlightbackground=LINE)
        option.grid(row=0, column=index, sticky="nsew", padx=(0 if index == 0 else 6, 0 if index == 2 else 6))
        choices.grid_columnconfigure(index, weight=1)
        icon = _label(option, "◎" if index == 0 else "◇", size=18, bold=True, fg="#C4B5FD", bg=SURFACE_3)
        icon.pack(pady=(22, 6))
        if badge:
            _label(option, badge, size=7, bold=True, fg=TEXT, bg=PURPLE).pack()
        _label(option, title, size=11, bold=True, bg=SURFACE_3).pack(pady=(7, 3))
        _label(option, description, size=8, fg=SOFT, bg=SURFACE_3).pack(pady=(0, 22))
        for widget in (option, icon):
            widget.bind("<Button-1>", lambda _event, value=title: select(value))
        for child in option.winfo_children():
            child.bind("<Button-1>", lambda _event, value=title: select(value))
        cards.append(option)

    info = tk.Frame(inner, bg="#171D3C", highlightthickness=1, highlightbackground="#4C3477")
    info.pack(fill="x", pady=(18, 0))
    info_title = _label(info, "", size=9, bold=True, fg=TEXT, bg="#171D3C")
    info_title.pack(anchor="w", padx=16, pady=(12, 3))
    info_text = _label(info, "", size=8, fg=SOFT, bg="#171D3C")
    info_text.pack(anchor="w", padx=16, pady=(0, 12))

    web_row = tk.Frame(inner, bg=SURFACE_2)
    web_service = _var(app, ("web_ai_service",), "ChatGPT")
    web_quality = _var(app, ("web_ai_quality",), "標準")
    service_box = _set_combo(web_row, "使用するWeb AI", web_service, ("ChatGPT", "Claude", "Gemini", "その他"), 0, 0, getattr(app, "_web_ai_service_changed", None))
    quality_box = _set_combo(web_row, "生成品質", web_quality, ("速さ優先", "標準", "高品質"), 0, 1, getattr(app, "_web_ai_quality_changed", None))
    web_row.grid_columnconfigure(0, weight=1)
    web_row.grid_columnconfigure(1, weight=1)

    def refresh(*_args):
        selected = str(_value(generation_var, specs[0][0]))
        for index, option in enumerate(cards):
            active = selected == specs[index][0]
            color = "#291653" if active else SURFACE_3
            option.configure(bg=color, highlightbackground=PURPLE_2 if active else LINE, highlightthickness=2 if active else 1)
            for child in option.winfo_children():
                try:
                    if str(child.cget("bg")) not in {PURPLE}:
                        child.configure(bg=color)
                except Exception:
                    pass
        if selected == "Web版AIで作成":
            info_title.configure(text="Web版AIで作成を選択中")
            info_text.configure(text="APIキー不要。完成記事を貼り付けると、装飾と画像計画まで確認します。")
            web_row.pack(fill="x", pady=(10, 0))
        elif selected == "OpenAI APIで作成":
            info_title.configure(text="OpenAI APIで作成を選択中")
            info_text.configure(text="API設定と概算料金を確認してから、アプリ内で生成します。")
            web_row.pack_forget()
        else:
            info_title.configure(text="プロンプト書き出しを選択中")
            info_text.configure(text="掲載先向けの完成記事プロンプトだけを書き出します。")
            web_row.pack_forget()

    try:
        generation_var.trace_add("write", refresh)
    except Exception:
        pass
    refresh()
    return card


def _image_page(app, parent):
    card = _card(parent)
    inner = tk.Frame(card, bg=SURFACE_2)
    inner.pack(fill="both", expand=True, padx=22, pady=20)
    _heading(inner, "完成記事を作る前の画像計画", "記事完成後に本文全体を確認し、関連する画像プロンプトを作成します")

    eyecatch = _var(app, ("image_eyecatch_enabled",), True, boolean=True)
    illustrations = _var(app, ("image_illustrations_enabled",), False, boolean=True)
    style = _var(app, ("image_style",), "おまかせ")
    mode = _var(app, ("image_mode",), "Web版（おすすめ）")
    count = _var(app, ("image_count",), "AIにおまかせ")
    toggle_row = tk.Frame(inner, bg=SURFACE_2)
    toggle_row.pack(fill="x")
    toggle_row.grid_columnconfigure(0, weight=1)
    toggle_row.grid_columnconfigure(1, weight=1)
    option_frames = []

    def option(column, title, description, variable, badge=""):
        frame = tk.Frame(toggle_row, bg=SURFACE_3, highlightthickness=1, highlightbackground=LINE)
        frame.grid(row=0, column=column, sticky="nsew", padx=(0 if column == 0 else 7, 7 if column == 0 else 0))
        check = tk.Checkbutton(
            frame,
            text="ON / OFF",
            variable=variable,
            command=lambda: refresh(),
            bg=SURFACE_3,
            fg=TEXT,
            activebackground=SURFACE_3,
            activeforeground=TEXT,
            selectcolor=PURPLE,
            cursor="hand2",
        )
        check.pack(anchor="w", padx=14, pady=(12, 0))
        if badge:
            _label(frame, badge, size=7, bold=True, fg=TEXT, bg=PURPLE).pack(anchor="w", padx=16, pady=(8, 0))
        _label(frame, title, size=11, bold=True, bg=SURFACE_3).pack(anchor="w", padx=16, pady=(8, 3))
        _label(frame, description, size=8, fg=SOFT, bg=SURFACE_3, wraplength=390, justify="left").pack(anchor="w", padx=16, pady=(0, 14))
        option_frames.append((frame, variable))

    option(0, "アイキャッチを作成", "完成記事を確認して、内容に合う1枚を提案", eyecatch, "noteでは推奨")
    option(1, "記事内の挿絵を作成", "必要枚数と最適な差し込み位置をAIが判断", illustrations)

    settings = tk.Frame(inner, bg=SURFACE_2)
    settings.pack(fill="x", pady=(14, 0))
    for column in range(3):
        settings.grid_columnconfigure(column, weight=1)
    _set_combo(settings, "デザイン", style, ("おまかせ", "アニメ風", "やさしいイラスト風", "漫画風", "ビジネス", "テック", "図解風", "ポップ風", "高級感", "ナチュラル", "ミニマル", "インフォグラフィック"), 0, 0)
    _set_combo(settings, "画像の作り方", mode, ("Web版（おすすめ）", "API版（準備中）", "ローカルGPU（準備中）"), 0, 1, getattr(app, "_image_mode_changed", None))
    count_box = _set_combo(settings, "挿絵の枚数", count, ("AIにおまかせ", "1", "2", "3", "4", "5", "6"), 0, 2)

    summary = tk.Frame(inner, bg="#151D35", highlightthickness=1, highlightbackground="#3A315E")
    summary.pack(fill="x", pady=(12, 0))
    _label(summary, "今回の画像計画", size=9, bold=True, bg="#151D35").pack(anchor="w", padx=16, pady=(11, 4))
    summary_text = _label(summary, "", size=8, fg=SOFT, bg="#151D35", justify="left")
    summary_text.pack(anchor="w", padx=16, pady=(0, 11))

    def refresh(*_args):
        eye_on = bool(_value(eyecatch, True))
        ill_on = bool(_value(illustrations, False))
        for frame, variable in option_frames:
            active = bool(_value(variable, False))
            color = "#291653" if active else SURFACE_3
            frame.configure(bg=color, highlightbackground=PURPLE_2 if active else LINE, highlightthickness=2 if active else 1)
            for child in frame.winfo_children():
                try:
                    if str(child.cget("bg")) not in {PURPLE}:
                        child.configure(bg=color, activebackground=color)
                except Exception:
                    pass
        count_box.configure(state="readonly" if ill_on else "disabled")
        eye_text = "1枚" if eye_on else "作成しない"
        ill_text = ("AIが必要枚数を判断（上限6枚）" if str(_value(count)) == "AIにおまかせ" else f"{_value(count)}枚") if ill_on else "作成しない"
        marker_text = "見出しと本文から自動提案" if ill_on else "なし"
        summary_text.configure(text=f"✓ アイキャッチ　{eye_text}\n✓ 挿絵　{ill_text}\n✓ 差し込み位置　{marker_text}")
        try:
            app._update_image_plan_controls()
        except Exception:
            pass

    refresh()
    return card


def _basic_page(app, parent):
    card = _card(parent)
    inner = tk.Frame(card, bg=SURFACE_2)
    inner.pack(fill="both", expand=True, padx=22, pady=20)
    _heading(inner, "記事の基本設定", "掲載先と読者を選ぶと、必要な構成をAIが調整します")
    grid = tk.Frame(inner, bg=SURFACE_2)
    grid.pack(fill="x")
    grid.grid_columnconfigure(0, weight=1)
    grid.grid_columnconfigure(1, weight=1)
    platform = _var(app, ("platform", "publish_to"), "note")
    article_type = _var(app, ("article_type",), "有料")
    genre = _var(app, ("genre",), "AI副業")
    subgenre = _var(app, ("subgenre",), "AIおまかせ")
    age = _var(app, ("target_age", "age"), "30代")
    gender = _var(app, ("target_gender", "gender"), "指定なし")
    length = _var(app, ("word_count", "length", "article_length"), "AIにおまかせ")
    reader = _var(app, ("reader_level",), "初心者")
    _set_combo(grid, "掲載先", platform, ("note", "Tips", "Brain", "ブログ"), 0, 0)
    _set_combo(grid, "記事タイプ", article_type, ("無料", "有料"), 0, 1)
    _set_combo(grid, "ジャンル", genre, ("AIおまかせ", "AI副業", "ガジェット・PC・デジタル", "美容・自分磨き", "仕事・キャリア", "生活・暮らし", "教育・学習"), 1, 0, getattr(app, "_genre_changed", None))
    _set_combo(grid, "サブジャンル", subgenre, ("AIおまかせ", "初心者向け", "実践ガイド", "比較・選び方", "収益化", "商品紹介"), 1, 1)
    _set_combo(grid, "対象年齢", age, ("AIおまかせ", "10代", "20代", "30代", "40代", "50代", "60代以上"), 2, 0)
    _set_combo(grid, "対象性別", gender, ("指定なし", "男性", "女性"), 2, 1)
    _set_combo(grid, "文字量", length, ("AIにおまかせ", "約2,000字", "約4,000字", "約6,000字", "約8,000字"), 3, 0)
    _set_combo(grid, "読者レベル", reader, ("初心者", "初心者〜中級者", "中級者", "上級者"), 3, 1)
    note = tk.Frame(inner, bg="#171D3C", highlightthickness=1, highlightbackground="#4C3477")
    note.pack(fill="x", pady=(12, 0))
    _label(note, "✦  AIのおすすめ", size=9, bold=True, fg="#C4B5FD", bg="#171D3C").pack(anchor="w", padx=15, pady=(10, 3))
    _label(note, "掲載先に合わせて見出し・装飾・CTAを最適化し、ジャンルに合う成果物を提案します。", size=8, fg=SOFT, bg="#171D3C").pack(anchor="w", padx=15, pady=(0, 10))
    return card


def _design_page(app, parent):
    card = _card(parent)
    inner = tk.Frame(card, bg=SURFACE_2)
    inner.pack(fill="both", expand=True, padx=22, pady=20)
    _heading(inner, "記事の内容を設計", "テーマを入力すると、読者と掲載先に合う構成をAIが提案します")
    theme = _var(app, ("theme", "topic", "article_theme"), "")
    theme_auto = _var(
        app,
        ("theme_ai_auto",),
        not bool(str(_value(theme) or "").strip()) or str(_value(theme)).strip() == "AIおまかせ",
        boolean=True,
    )
    theme_header = tk.Frame(inner, bg=SURFACE_2)
    theme_header.pack(fill="x", pady=(0, 6))
    _label(theme_header, "記事テーマ・伝えたいこと", size=8, bold=True, fg=SOFT).pack(side="left")
    auto_check = tk.Checkbutton(
        theme_header,
        text="AIおまかせ",
        variable=theme_auto,
        bg=SURFACE_2,
        fg="#C4B5FD",
        activebackground=SURFACE_2,
        activeforeground=TEXT,
        selectcolor=PURPLE,
        cursor="hand2",
    )
    auto_check.pack(side="right")
    editor = tk.Text(inner, height=4, wrap="word", bg="#0D182A", fg=TEXT, insertbackground=TEXT, relief="flat", padx=12, pady=10, highlightthickness=1, highlightbackground=LINE)
    editor.pack(fill="x")
    manual_theme = {"value": "" if str(_value(theme)).strip() == "AIおまかせ" else str(_value(theme) or "")}

    def sync_theme(_event=None):
        try:
            if bool(_value(theme_auto, False)):
                theme.set("AIおまかせ")
                return
            value = editor.get("1.0", "end").strip()
            manual_theme["value"] = value
            theme.set(value)
        except Exception:
            pass

    def refresh_theme_mode():
        editor.configure(state="normal")
        editor.delete("1.0", "end")
        if bool(_value(theme_auto, False)):
            editor.insert("1.0", "AIおまかせ")
            editor.configure(state="disabled")
            theme.set("AIおまかせ")
        else:
            editor.insert("1.0", manual_theme["value"])
            theme.set(manual_theme["value"])
        editor.configure(highlightbackground=PURPLE_2 if bool(_value(theme_auto, False)) else LINE)

    editor.bind("<KeyRelease>", sync_theme)
    auto_check.configure(command=refresh_theme_mode)
    refresh_theme_mode()
    additions = tk.Frame(inner, bg=SURFACE_2)
    additions.pack(fill="x", pady=(14, 0))
    for column in range(3):
        additions.grid_columnconfigure(column, weight=1)
    bonus = _var(app, ("paid_bonus_enabled", "bonus_enabled"), True, boolean=True)
    affiliate = _var(app, ("affiliate_enabled",), False, boolean=True)
    magazine = _var(app, ("magazine_enabled",), False, boolean=True)
    for column, (text, variable) in enumerate((("有料特典をAI提案", bonus), ("アフィリエイト", affiliate), ("noteマガジン", magazine))):
        check = tk.Checkbutton(additions, text=text, variable=variable, bg=SURFACE_3, fg=TEXT, activebackground=SURFACE_3, activeforeground=TEXT, selectcolor=PURPLE, anchor="w", padx=12, pady=10)
        check.grid(row=0, column=column, sticky="ew", padx=(0 if column == 0 else 5, 0 if column == 2 else 5))
    latest = _var(app, ("latest_info", "latest_info_mode"), "必要時のみ")
    latest_row = tk.Frame(inner, bg=SURFACE_2)
    latest_row.pack(fill="x", pady=(12, 0))
    _label(latest_row, "最新情報", size=8, fg=SOFT).pack(side="left")
    ttk.Combobox(latest_row, textvariable=latest, values=("必要時のみ", "必ず確認", "使用しない"), state="readonly", style="Dark.TCombobox", width=18).pack(side="left", padx=(10, 0))
    info = tk.Frame(inner, bg="#151D35", highlightthickness=1, highlightbackground="#3A315E")
    info.pack(fill="x", pady=(14, 0))
    _label(info, "次の画面でタイトル候補を作成し、1つ選んでから完成記事へ進みます。", size=8, fg="#C4B5FD", bg="#151D35").pack(anchor="w", padx=15, pady=11)
    app._v0427_sync_theme = sync_theme
    app._v0430_theme_editor = editor
    app._v0430_theme_auto = theme_auto
    return card


def install_article_wizard(app, body):
    """Replace the legacy long form with the dedicated six-step visual wizard."""
    app._article_create_body = body
    existing = list(body.winfo_children())
    for widget in existing:
        _hide(widget)

    root = tk.Frame(body, bg=BG)
    root.pack(fill="both", expand=True)
    progress = _build_progress(root)
    content = tk.Frame(root, bg=BG)
    content.pack(fill="both", expand=True)
    generation = tk.StringVar(master=app, value=getattr(app, "_article_generation_method", "Web版AIで作成"))
    if generation.get() == "Web版AI（おすすめ）":
        generation.set("Web版AIで作成")
    app._article_generation_method_var = generation
    pages = (
        _generation_page(app, content, generation),
        _image_page(app, content),
        _basic_page(app, content),
        _design_page(app, content),
    )
    for page in pages:
        _hide(page)

    footer = tk.Frame(root, bg=BG, highlightthickness=1, highlightbackground=LINE)
    footer.pack(fill="x", pady=(12, 0))
    back = _secondary(app, footer, "戻る", lambda: show_page(state["index"] - 1))
    back.pack(side="left", padx=10, pady=9)
    status = _label(footer, "", size=9, bold=True, fg="#C4B5FD", bg=BG)
    status.pack(side="left", padx=12)
    next_button = _primary(app, footer, "次へ  ›", lambda: advance())
    next_button.pack(side="right", padx=10, pady=9)
    state = {"index": 0}

    def invoke_generation():
        try:
            if hasattr(app, "_v0427_sync_theme"):
                app._v0427_sync_theme()
            if hasattr(app, "_sync_image_settings"):
                app._sync_image_settings()
            selected = str(generation.get())
            candidates = _find_buttons(existing)
            if selected == "Web版AIで作成":
                priorities = (
                    lambda text: "Web版AI" in text and "作成" in text,
                    lambda text: "Web" in text and "作成" in text,
                )
            elif selected == "OpenAI APIで作成":
                priorities = (
                    lambda text: "API" in text and "作成" in text,
                    lambda text: "記事を作成" in text,
                )
            else:
                priorities = (
                    lambda text: "プロンプト" in text and ("書き出" in text or "作成" in text),
                )
            for matches in priorities:
                for button in candidates:
                    text = str(button.cget("text") or "")
                    if not matches(text):
                        continue
                    app._v0430_creation_action = text
                    button.invoke()
                    return
            if selected == "Web版AIで作成" and hasattr(app, "_open_web_ai_mode"):
                app._v0430_creation_action = "direct_web_fallback"
                app._open_web_ai_mode()
                return
            messagebox.showinfo("記事作成", "選択した生成方法の準備画面を開けませんでした。設定を確認してください。")
        except Exception as exc:
            messagebox.showerror("記事作成", f"作成画面へ進めませんでした。\n{exc}")

    def advance():
        if state["index"] == 3:
            invoke_generation()
        else:
            show_page(state["index"] + 1)

    def show_page(index):
        index = max(0, min(int(index), len(pages) - 1))
        for page in pages:
            _hide(page)
        state["index"] = index
        pages[index].pack(fill="both", expand=True)
        _update_progress(progress, index)
        status.configure(text=f"STEP {index + 1} / 6　{STEP_LABELS[index]}")
        back.configure(state="normal" if index > 0 else "disabled")
        next_button.configure(text="作成へ  ›" if index == 3 else "次へ  ›")
        try:
            body.update_idletasks()
            parent = body.master
            if hasattr(parent, "yview_moveto"):
                parent.yview_moveto(0.0)
        except Exception:
            pass

    app._v0427_article_wizard = {
        "root": root,
        "pages": pages,
        "show_page": show_page,
        "original_widgets": existing,
    }
    _install_history_panel(app)
    show_page(0)


def _text_get(fields, name):
    widget = fields.get(name)
    if widget is None:
        return ""
    try:
        return widget.get("1.0", "end").strip()
    except Exception:
        return ""


def _text_set(fields, name, value):
    widget = fields.get(name)
    if widget is None:
        return
    try:
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        if value:
            widget.insert("1.0", value)
    except Exception:
        pass


def _decorate_preview(widget):
    if widget is None:
        return
    try:
        widget.tag_configure("v0427_h1", font=("Yu Gothic UI", 16, "bold"), foreground="#F8FAFC", spacing1=12, spacing3=8)
        widget.tag_configure("v0427_h2", font=("Yu Gothic UI", 13, "bold"), foreground="#C4B5FD", spacing1=10, spacing3=6)
        widget.tag_configure("v0427_h3", font=("Yu Gothic UI", 11, "bold"), foreground="#93C5FD", spacing1=8, spacing3=4)
        widget.tag_configure("v0427_quote", foreground="#CBD5E1", background="#17213A", lmargin1=14, lmargin2=14, spacing1=4, spacing3=4)
        content = widget.get("1.0", "end-1c")
        for number, line in enumerate(content.splitlines(), start=1):
            start, end = f"{number}.0", f"{number}.end"
            stripped = line.lstrip()
            if stripped.startswith("# "):
                widget.tag_add("v0427_h1", start, end)
            elif stripped.startswith("## "):
                widget.tag_add("v0427_h2", start, end)
            elif stripped.startswith("### "):
                widget.tag_add("v0427_h3", start, end)
            elif stripped.startswith("> "):
                widget.tag_add("v0427_quote", start, end)
    except Exception:
        pass


def _copy(app, text, message):
    if not text:
        messagebox.showinfo("コピー", "コピーできる内容がまだありません。")
        return
    app.clipboard_clear()
    app.clipboard_append(text)
    app.update()
    messagebox.showinfo("コピー", message)


def _build_image_result_panel(app, parent):
    panel = _card(parent)
    panel.configure(width=340)
    panel.pack_propagate(False)
    app._v0427_image_result_panel = panel
    return panel


def _refresh_image_result_panel(app, panel, fields):
    for child in panel.winfo_children():
        child.destroy()
    _label(panel, "画像プロンプト", size=12, bold=True).pack(anchor="w", padx=16, pady=(16, 2))
    _label(panel, "完成記事全体を解析済み", size=8, fg=GREEN).pack(anchor="w", padx=16, pady=(0, 12))
    try:
        source = _text_get(fields, "formatted_text") or _text_get(fields, "final_text")
        if hasattr(app, "_sync_image_settings"):
            app._sync_image_settings()
        data = app.web_ai_bridge.build_image_prompts(article_text=source) if source else app.web_ai_bridge.build_image_prompts()
    except TypeError:
        try:
            data = app.web_ai_bridge.build_image_prompts()
        except Exception:
            data = {}
    except Exception:
        data = {}
    rows = []
    eyecatch = str(data.get("eyecatch_prompt") or "")
    if eyecatch:
        rows.append(("アイキャッチ　1枚", eyecatch))
    for index, item in enumerate(data.get("illustration_prompts") or [], start=1):
        if isinstance(item, dict):
            location = str(item.get("position") or item.get("label") or f"挿絵 {index}")
            prompt = str(item.get("prompt") or "")
        else:
            location, prompt = f"挿絵 {index}", str(item)
        rows.append((f"挿絵 {index}　{location}", prompt))
    if not rows:
        _label(panel, "画像なし、または記事の読み込み後に作成されます。", size=8, fg=MUTED, wraplength=295, justify="left").pack(anchor="w", padx=16, pady=12)
        return
    all_prompts = []
    for title, prompt in rows:
        row = tk.Frame(panel, bg="#0D182A", highlightthickness=1, highlightbackground=LINE)
        row.pack(fill="x", padx=12, pady=4)
        _label(row, title, size=8, fg=SOFT, bg="#0D182A", wraplength=220, justify="left").pack(side="left", fill="x", expand=True, padx=9, pady=9)
        _secondary(app, row, "コピー", lambda value=prompt: _copy(app, value, "画像プロンプトをコピーしました。")).pack(side="right", padx=6, pady=6)
        all_prompts.append(f"【{title}】\n{prompt}")
    _primary(app, panel, "すべてコピー", lambda: _copy(app, "\n\n".join(all_prompts), "すべての画像プロンプトをコピーしました。")).pack(fill="x", padx=12, pady=(12, 14))


def install_web_ai_wizard(app, win, req, pages, fields):
    """Present the existing Web AI controls as the final visual stages of the six-step wizard."""
    pages = [page for page in pages if page is not None]
    if not pages:
        return
    for child in list(win.winfo_children()):
        _hide(child)
    shell = tk.Frame(win, bg=BG)
    shell.pack(fill="both", expand=True, padx=12, pady=(4, 10))
    progress = _build_progress(shell)
    substatus = _label(shell, "", size=8, fg=MUTED, bg=BG)
    substatus.pack(anchor="w", pady=(0, 8))
    content = tk.Frame(shell, bg=BG)
    content.pack(fill="both", expand=True)
    image_panel = _build_image_result_panel(app, content)
    footer = tk.Frame(shell, bg=BG, highlightthickness=1, highlightbackground=LINE)
    footer.pack(fill="x", pady=(12, 0))
    state = {"index": 0}

    def capture():
        try:
            app.web_ai_bridge.save_editor_draft(raw_text=_text_get(fields, "final_text"), formatted_text=_text_get(fields, "formatted_text"))
        except Exception:
            pass

    def apply_snapshot(snapshot):
        request = dict(snapshot.get("article_request") or {})
        for key, value in request.items():
            variable = getattr(app, "vars", {}).get(key)
            if variable is not None:
                try:
                    variable.set(value)
                except Exception:
                    pass
        selected = fields.get("selected_title")
        if selected is not None:
            try:
                selected.set(snapshot.get("selected_title") or "")
            except Exception:
                pass
        _text_set(fields, "paste_titles", snapshot.get("title_response_raw") or "")
        _text_set(fields, "final_text", snapshot.get("raw_web_output") or snapshot.get("normalized_output") or "")
        _text_set(fields, "formatted_text", snapshot.get("formatted_output") or "")
        step = str(snapshot.get("current_step") or "00")
        target = {"00": 0, "01": 0, "02": min(1, len(pages) - 1), "03": min(2, len(pages) - 1), "04": len(pages) - 1, "05": len(pages) - 1}.get(step, 0)
        show_page(target)

    def load_history(article_id):
        capture()
        try:
            snapshot = app.web_ai_bridge.load_history(article_id)
        except Exception as exc:
            messagebox.showwarning("最近の作業", f"履歴を読み込めませんでした。\n{exc}")
            return
        if snapshot:
            apply_snapshot(snapshot)

    def delete_history(article_id):
        if not messagebox.askyesno("履歴を削除", "この作業履歴を一覧から削除しますか？"):
            return
        try:
            app.web_ai_bridge.delete_history(article_id)
        except Exception as exc:
            messagebox.showwarning("履歴を削除", f"履歴を削除できませんでした。\n{exc}")
        _install_history_panel(app, load_history, delete_history)

    def clear_paste():
        _text_set(fields, "final_text", "")
        _text_set(fields, "formatted_text", "")
        try:
            app.web_ai_bridge.clear_article_content()
        except Exception as exc:
            messagebox.showwarning("貼り付け欄をクリア", f"入力欄をクリアできませんでした。\n{exc}")
        _install_history_panel(app, load_history, delete_history)

    def new_article():
        capture()
        try:
            app.web_ai_bridge.new_article()
        except Exception as exc:
            messagebox.showwarning("新しい記事", f"新しい記事を開始できませんでした。\n{exc}")
            return
        _text_set(fields, "paste_titles", "")
        _text_set(fields, "final_text", "")
        _text_set(fields, "formatted_text", "")
        selected = fields.get("selected_title")
        if selected is not None:
            try:
                selected.set("")
            except Exception:
                pass
        show_page(0)
        _install_history_panel(app, load_history, delete_history)

    def go_back():
        if state["index"] > 0:
            show_page(state["index"] - 1)
        elif hasattr(app, "_restore_article_setup"):
            app._restore_article_setup()

    back = _secondary(app, footer, "戻る", go_back)
    back.pack(side="left", padx=10, pady=9)
    clear = _secondary(app, footer, "貼り付け欄をクリア", clear_paste)
    clear.pack(side="left", padx=(0, 7), pady=9)
    fresh = _secondary(app, footer, "新しい記事", new_article)
    fresh.pack(side="left", pady=9)
    status = _label(footer, "", size=9, bold=True, fg="#C4B5FD", bg=BG)
    status.pack(side="left", padx=14)
    next_button = _primary(app, footer, "次へ  ›", lambda: show_page(state["index"] + 1))
    next_button.pack(side="right", padx=10, pady=9)

    labels = ("タイトル準備", "タイトル選択", "完成記事を作成", "記事確認・出力")
    step_map = (3, 3, 4, 5)

    def show_page(index):
        capture()
        index = max(0, min(int(index), len(pages) - 1))
        for page in pages:
            _hide(page)
        _hide(image_panel)
        state["index"] = index
        active = step_map[index] if index < len(step_map) else min(5, index + 3)
        _update_progress(progress, active)
        label = labels[index] if index < len(labels) else f"作成 {index + 1}"
        status.configure(text=f"STEP {active + 1} / 6　{STEP_LABELS[active]}")
        substatus.configure(text=f"{label}　・　1項目ずつ進みます")
        if active == 5:
            pages[index].pack(in_=content, side="left", fill="both", expand=True, padx=(0, 10))
            image_panel.pack(side="right", fill="y")
            _decorate_preview(fields.get("formatted_text"))
            _refresh_image_result_panel(app, image_panel, fields)
        else:
            pages[index].pack(in_=content, fill="both", expand=True)
        clear.configure(state="normal" if active == 4 else "disabled")
        if index >= len(pages) - 1:
            next_button.configure(text="新しい記事を作る", command=new_article)
        else:
            next_button.configure(text="次へ  ›", command=lambda: show_page(state["index"] + 1))
        _install_history_panel(app, load_history, delete_history)

    app._v0427_web_wizard = {"shell": shell, "show_page": show_page, "pages": pages}
    try:
        snapshot = app.web_ai_bridge.current_snapshot()
    except Exception:
        snapshot = {}
    step = str(snapshot.get("current_step") or "00")
    start = {"00": 0, "01": 0, "02": min(1, len(pages) - 1), "03": min(2, len(pages) - 1), "04": len(pages) - 1, "05": len(pages) - 1}.get(step, 0)
    show_page(start)
