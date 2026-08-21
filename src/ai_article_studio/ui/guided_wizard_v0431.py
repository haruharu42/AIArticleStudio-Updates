from __future__ import annotations

import re
import tkinter as tk
import webbrowser
from tkinter import messagebox

from .guided_wizard_v0427 import (
    BG,
    GREEN,
    LINE,
    MUTED,
    PURPLE,
    PURPLE_2,
    SOFT,
    STEP_LABELS,
    SURFACE_2,
    SURFACE_3,
    TEXT,
    _basic_page,
    _build_progress,
    _card,
    _design_page,
    _generation_page,
    _hide,
    _image_page,
    _find_sidebar,
    _history_items,
    _label,
    _primary,
    _refresh_image_result_panel,
    _secondary,
    _update_progress,
    _value,
)
from .guided_wizard_v0428 import _hide_legacy_chrome


ACTIVATION_MARKER = "v0.4.3.1-embedded-six-step-flow"
LIVE_BODY_WORDS = ("生成方法を選択", "完成記事を作る前の画像計画", "基本設定")


def _manager(widget):
    try:
        return str(widget.winfo_manager() or "")
    except Exception:
        return ""


def _widget_text(widget):
    try:
        if str(widget.winfo_class()) in {
            "Label", "TLabel", "Button", "TButton", "Checkbutton", "TCheckbutton", "Radiobutton", "TRadiobutton"
        }:
            return str(widget.cget("text") or "").strip()
    except Exception:
        pass
    return ""


def _walk(widget):
    yield widget
    try:
        children = list(widget.winfo_children())
    except Exception:
        children = []
    for child in children:
        yield from _walk(child)


def _descendant_text(widget):
    return "\n".join(value for value in (_widget_text(item) for item in _walk(widget)) if value)


def find_live_article_body(app):
    candidates = []
    for widget in _walk(app):
        if widget is app or _manager(widget) not in {"pack", "grid", "place", "canvas"}:
            continue
        try:
            widget_class = str(widget.winfo_class())
        except Exception:
            continue
        if widget_class not in {"Frame", "TFrame", "Canvas"}:
            continue
        joined = _descendant_text(widget)
        if not all(word in joined for word in LIVE_BODY_WORDS):
            continue
        if "AI ASSIST" in joined or "記事ライブラリ" in joined:
            continue
        candidates.append((sum(1 for _item in _walk(widget)), widget))
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def _app_var(app, *names, default=""):
    for name in names:
        variable = getattr(app, "vars", {}).get(name)
        if variable is not None:
            try:
                return variable.get()
            except Exception:
                pass
    return default


def _set_app_var(app, name, value):
    variable = getattr(app, "vars", {}).get(name)
    if variable is not None:
        try:
            variable.set(value)
        except Exception:
            pass


def _request_snapshot(app):
    request = {}
    for name, variable in getattr(app, "vars", {}).items():
        try:
            request[name] = variable.get()
        except Exception:
            pass
    aliases = {
        "platform": _app_var(app, "platform", "publish_to", default="note"),
        "article_type": _app_var(app, "article_type", default="有料"),
        "genre": _app_var(app, "genre", default="AI副業"),
        "subgenre": _app_var(app, "subgenre", default="AIおまかせ"),
        "target_age": _app_var(app, "target_age", "age", default="30代"),
        "target_gender": _app_var(app, "target_gender", "gender", default="指定なし"),
        "word_count": _app_var(app, "word_count", "length", "article_length", default="AIにおまかせ"),
        "reader_level": _app_var(app, "reader_level", default="初心者"),
        "theme": _app_var(app, "theme", "topic", "article_theme", default="AIおまかせ"),
        "paid_bonus_enabled": bool(_app_var(app, "paid_bonus_enabled", "bonus_enabled", default=True)),
        "affiliate_enabled": bool(_app_var(app, "affiliate_enabled", default=False)),
        "magazine_enabled": bool(_app_var(app, "magazine_enabled", default=False)),
        "latest_info": _app_var(app, "latest_info", "latest_info_mode", default="必要時のみ"),
    }
    request.update(aliases)
    return request


def _parse_title_candidates(raw):
    candidates = []
    for original in str(raw or "").splitlines():
        line = original.strip().strip("`# ")
        line = re.sub(r"^(?:候補\s*)?[0-9０-９]+\s*[\.．、:)）-]\s*", "", line)
        line = re.sub(r"^[-*・]\s*", "", line)
        line = line.strip("『』「」\"'")
        if len(line) < 8 or line in candidates:
            continue
        candidates.append(line)
    return candidates[:10]


def _copy(app, text, message="コピーしました。"):
    value = str(text or "").strip()
    if not value:
        messagebox.showinfo("コピー", "コピーできる内容がまだありません。")
        return
    app.clipboard_clear()
    app.clipboard_append(value)
    app.update()
    messagebox.showinfo("コピー", message)


def _text_value(widget):
    try:
        return widget.get("1.0", "end").strip()
    except Exception:
        return ""


def _set_text(widget, value, readonly=False):
    try:
        widget.configure(state="normal")
        widget.delete("1.0", "end")
        if value:
            widget.insert("1.0", value)
        if readonly:
            widget.configure(state="disabled")
    except Exception:
        pass


def _decorate_completion_preview(widget):
    try:
        widget.tag_configure("v0431_h1", font=("Yu Gothic UI", 16, "bold"), foreground="#111827", spacing1=12, spacing3=8)
        widget.tag_configure("v0431_h2", font=("Yu Gothic UI", 13, "bold"), foreground="#5B21B6", spacing1=10, spacing3=6)
        widget.tag_configure("v0431_h3", font=("Yu Gothic UI", 11, "bold"), foreground="#1D4ED8", spacing1=8, spacing3=4)
        widget.tag_configure("v0431_quote", foreground="#374151", background="#EDE9FE", lmargin1=14, lmargin2=14, spacing1=4, spacing3=4)
        content = widget.get("1.0", "end-1c")
        for number, line in enumerate(content.splitlines(), start=1):
            start, end = f"{number}.0", f"{number}.end"
            stripped = line.lstrip()
            if stripped.startswith("# "):
                widget.tag_add("v0431_h1", start, end)
            elif stripped.startswith("## "):
                widget.tag_add("v0431_h2", start, end)
            elif stripped.startswith("### "):
                widget.tag_add("v0431_h3", start, end)
            elif stripped.startswith("> "):
                widget.tag_add("v0431_quote", start, end)
    except Exception:
        pass


def _provider_settings(app):
    return (
        str(_app_var(app, "web_ai_service", default="ChatGPT") or "ChatGPT"),
        str(_app_var(app, "web_ai_quality", default="標準") or "標準"),
        str(_app_var(app, "web_ai_model", default="") or ""),
    )


def _open_web_ai(app, provider):
    try:
        app._open_web_ai_site(provider)
        return
    except Exception:
        pass
    urls = {
        "ChatGPT": "https://chatgpt.com/",
        "Claude": "https://claude.ai/",
        "Gemini": "https://gemini.google.com/",
    }
    url = urls.get(provider)
    if url:
        webbrowser.open(url)


def _open_platform(app, platform):
    try:
        app._open_publish_platform(platform)
        return
    except Exception:
        pass
    urls = {"note": "https://note.com/", "Tips": "https://tips.jp/", "Brain": "https://brain-market.com/"}
    if urls.get(platform):
        webbrowser.open(urls[platform])


def _hidden_creation_action(app, existing, generation):
    priorities = (
        (lambda text: "API" in text and "作成" in text),
        (lambda text: "記事を作成" in text),
    )
    for matches in priorities:
        for widget in existing:
            for item in _walk(widget):
                try:
                    if str(item.winfo_class()) not in {"Button", "TButton"}:
                        continue
                    text = str(item.cget("text") or "")
                    if matches(text):
                        app._v0431_creation_action = text
                        item.invoke()
                        return True
                except Exception:
                    pass
    messagebox.showinfo("記事作成", f"{generation}の既存作成処理を開けませんでした。設定を確認してください。")
    return False


def _install_history_panel_10(app, on_load=None, on_delete=None):
    found = _find_sidebar(app)
    if not found:
        return
    sidebar, first_panel = found
    panel = getattr(app, "_v0431_history_panel", None)
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
        app._v0431_history_panel = panel
        app._v0431_history_list = listing
        old = getattr(app, "_v0427_history_panel", None)
        if old is not None and old is not panel:
            _hide(old)
    listing = app._v0431_history_list
    for child in listing.winfo_children():
        child.destroy()
    items = _history_items(app)
    if not items:
        _label(listing, "履歴はまだありません", size=8, fg=MUTED).pack(anchor="w", padx=5, pady=6)
        return
    for item in items[:10]:
        row = tk.Frame(listing, bg="#0D182A", highlightthickness=1, highlightbackground=LINE)
        row.pack(fill="x", pady=3)
        title = str(item.get("title") or "新しい記事")
        if len(title) > 19:
            title = title[:18] + "…"
        article_id = str(item.get("article_id") or "")
        command = (lambda aid=article_id: on_load(aid)) if on_load else (lambda: None)
        tk.Button(row, text=title, command=command, bg="#0D182A", fg=TEXT, activebackground=SURFACE_3, activeforeground=TEXT, relief="flat", anchor="w", cursor="hand2" if on_load else "arrow").pack(side="left", fill="x", expand=True, padx=5, pady=5)
        if on_delete:
            tk.Button(row, text="×", command=lambda aid=article_id: on_delete(aid), bg="#0D182A", fg=MUTED, activebackground="#7F1D1D", activeforeground=TEXT, relief="flat", cursor="hand2").pack(side="right", padx=4)


def install_article_wizard(app, body):
    """Install the approved six-step flow entirely inside the Article Creator body."""
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

    pages = [
        _generation_page(app, content, generation),
        _image_page(app, content),
        _basic_page(app, content),
        _design_page(app, content),
        _card(content),
        tk.Frame(content, bg=BG),
    ]
    for page in pages:
        _hide(page)

    footer = tk.Frame(root, bg=BG, highlightthickness=1, highlightbackground=LINE)
    footer.pack(fill="x", pady=(12, 0))
    state = {"index": 0, "phase": 0, "title_prompt": "", "article_prompt": "", "candidates": [], "article": ""}
    fields = {
        "title_response": None,
        "selected_title": tk.StringVar(master=app, value=""),
        "article_response": None,
        "formatted_text": None,
    }

    def refresh_history():
        _install_history_panel_10(app, load_history, delete_history)

    def start_new():
        try:
            app.web_ai_bridge.new_article()
        except Exception:
            pass
        state.update({"phase": 0, "title_prompt": "", "article_prompt": "", "candidates": [], "article": ""})
        fields["selected_title"].set("")
        fields["title_response"] = None
        fields["article_response"] = None
        fields["formatted_text"] = None
        show_page(0)
        refresh_history()

    def clear_paste_fields():
        for key in ("title_response", "article_response"):
            widget = fields.get(key)
            if widget is not None:
                _set_text(widget, "")
        state["article"] = ""
        try:
            app.web_ai_bridge.clear_article_content()
        except Exception:
            pass
        refresh_history()

    def load_history(article_id):
        try:
            snapshot = app.web_ai_bridge.load_history(article_id)
        except Exception as exc:
            messagebox.showwarning("最近の作業", f"履歴を読み込めませんでした。\n{exc}")
            return
        if not snapshot:
            return
        for key, value in dict(snapshot.get("article_request") or {}).items():
            _set_app_var(app, key, value)
        state["title_prompt"] = str(snapshot.get("title_prompt") or "")
        state["article_prompt"] = str(snapshot.get("final_prompt") or "")
        state["candidates"] = list(snapshot.get("title_candidates") or [])
        fields["selected_title"].set(str(snapshot.get("selected_title") or ""))
        state["article"] = str(snapshot.get("formatted_output") or snapshot.get("normalized_output") or snapshot.get("raw_web_output") or "")
        if state["article"]:
            render_completion()
            show_page(5)
        else:
            state["phase"] = 1 if state["candidates"] else 0
            render_creation()
            show_page(4)

    def delete_history(article_id):
        if not messagebox.askyesno("履歴を削除", "この作業履歴を一覧から削除しますか？"):
            return
        try:
            app.web_ai_bridge.delete_history(article_id)
        except Exception as exc:
            messagebox.showwarning("履歴を削除", f"履歴を削除できませんでした。\n{exc}")
        refresh_history()

    back_button = _secondary(app, footer, "戻る", lambda: go_back())
    back_button.pack(side="left", padx=10, pady=9)
    clear_button = _secondary(app, footer, "貼り付け欄をクリア", clear_paste_fields)
    new_button = _secondary(app, footer, "新しい記事", start_new)
    status = _label(footer, "", size=9, bold=True, fg="#C4B5FD", bg=BG)
    status.pack(side="left", padx=12)
    next_button = _primary(app, footer, "次へ  ›", lambda: advance())
    next_button.pack(side="right", padx=10, pady=9)

    def prepare_embedded_creation():
        if hasattr(app, "_v0427_sync_theme"):
            app._v0427_sync_theme()
        if hasattr(app, "_sync_image_settings"):
            app._sync_image_settings()
        selected = str(generation.get())
        if selected == "OpenAI APIで作成":
            return _hidden_creation_action(app, existing, selected)
        bridge = getattr(app, "web_ai_bridge", None)
        if bridge is None or not hasattr(bridge, "build_title_step"):
            messagebox.showerror("記事作成", "Web版AIの作成機能を初期化できませんでした。")
            return False
        provider, quality, model = _provider_settings(app)
        try:
            result = bridge.build_title_step(
                _request_snapshot(app), provider=provider, quality=quality, model_label=model
            )
        except Exception as exc:
            messagebox.showerror("記事作成", f"タイトル準備を開始できませんでした。\n{exc}")
            return False
        state.update({"phase": 0, "title_prompt": str(result.get("prompt") or ""), "article_prompt": "", "candidates": [], "article": ""})
        fields["selected_title"].set("")
        render_creation()
        show_page(4)
        refresh_history()
        return True

    def render_creation():
        page = pages[4]
        for child in page.winfo_children():
            child.destroy()
        inner = tk.Frame(page, bg=SURFACE_2)
        inner.pack(fill="both", expand=True, padx=20, pady=17)
        provider, _quality, _model = _provider_settings(app)
        phase = int(state["phase"])
        _label(inner, "WEB AI PUBLISHING MODE", size=7, bold=True, fg="#A855F7").pack(anchor="w")
        _label(inner, "コピー → 候補を貼る → 1つ選ぶ → 完成記事をコピー", size=16, bold=True).pack(anchor="w", pady=(7, 3))
        _label(inner, f"API料金なし。{provider}を使って、掲載先へ貼れる完成記事まで同じ画面で進みます。", size=8, fg=SOFT).pack(anchor="w", pady=(0, 13))

        if phase == 0:
            _phase_heading(inner, "01", "タイトル候補を作る", "まずWeb版AIへ貼るプロンプトをコピーします")
            prompt = tk.Text(inner, height=7, wrap="word", bg="#0D182A", fg=TEXT, relief="flat", padx=11, pady=9, highlightthickness=1, highlightbackground=LINE)
            prompt.pack(fill="x")
            _set_text(prompt, state["title_prompt"], readonly=True)
            actions = tk.Frame(inner, bg=SURFACE_2)
            actions.pack(fill="x", pady=(9, 0))
            _primary(app, actions, "タイトル候補用プロンプトをコピー", lambda: _copy(app, state["title_prompt"], "タイトル候補用プロンプトをコピーしました。" )).pack(side="left")
            _secondary(app, actions, f"{provider}を開く", lambda: _open_web_ai(app, provider)).pack(side="left", padx=8)
            _label(inner, "Web版AIの回答を貼り付け", size=8, bold=True, fg=SOFT).pack(anchor="w", pady=(12, 5))
            response = tk.Text(inner, height=5, wrap="word", bg="#0D182A", fg=TEXT, insertbackground=TEXT, relief="flat", padx=11, pady=9, highlightthickness=1, highlightbackground=LINE)
            response.pack(fill="x")
            fields["title_response"] = response
            snapshot = getattr(app, "web_ai_bridge").current_snapshot()
            _set_text(response, snapshot.get("title_response_raw") or "")
        elif phase == 1:
            _phase_heading(inner, "02", "タイトルを1つ選択", "記事の目的と読者に最も合う候補を選びます")
            selected = fields["selected_title"]
            for index, title in enumerate(state["candidates"], start=1):
                row = tk.Frame(inner, bg=SURFACE_3, highlightthickness=1, highlightbackground=LINE)
                row.pack(fill="x", pady=4)
                radio = tk.Radiobutton(row, text=title, variable=selected, value=title, bg=SURFACE_3, fg=TEXT, activebackground=SURFACE_3, activeforeground=TEXT, selectcolor=PURPLE, anchor="w", justify="left", wraplength=760, padx=12, pady=10)
                radio.pack(fill="x")
                if index == 1 and not selected.get():
                    selected.set(title)
        else:
            _phase_heading(inner, "03", "完成記事を作成", "選んだタイトルと全設定を反映したプロンプトです")
            title_box = tk.Frame(inner, bg="#291653", highlightthickness=1, highlightbackground="#6941A7")
            title_box.pack(fill="x", pady=(0, 9))
            _label(title_box, "選択したタイトル", size=7, fg="#B8A6DD", bg="#291653").pack(anchor="w", padx=12, pady=(8, 2))
            _label(title_box, fields["selected_title"].get(), size=9, bold=True, bg="#291653", wraplength=800, justify="left").pack(anchor="w", padx=12, pady=(0, 8))
            prompt = tk.Text(inner, height=7, wrap="word", bg="#0D182A", fg=TEXT, relief="flat", padx=11, pady=9, highlightthickness=1, highlightbackground=LINE)
            prompt.pack(fill="x")
            _set_text(prompt, state["article_prompt"], readonly=True)
            actions = tk.Frame(inner, bg=SURFACE_2)
            actions.pack(fill="x", pady=(9, 0))
            _primary(app, actions, "完成記事用プロンプトをコピー", lambda: _copy(app, state["article_prompt"], "完成記事用プロンプトをコピーしました。" )).pack(side="left")
            _secondary(app, actions, f"{provider}を開く", lambda: _open_web_ai(app, provider)).pack(side="left", padx=8)
            _label(inner, "完成記事を貼り付け", size=8, bold=True, fg=SOFT).pack(anchor="w", pady=(12, 5))
            response = tk.Text(inner, height=6, wrap="word", bg="#0D182A", fg=TEXT, insertbackground=TEXT, relief="flat", padx=11, pady=9, highlightthickness=1, highlightbackground=LINE)
            response.pack(fill="x")
            fields["article_response"] = response
            snapshot = getattr(app, "web_ai_bridge").current_snapshot()
            _set_text(response, snapshot.get("raw_web_output") or "")
        configure_footer()

    def render_completion():
        page = pages[5]
        for child in page.winfo_children():
            child.destroy()
        article = str(state["article"] or "").strip()
        left = _card(page)
        left.pack(side="left", fill="both", expand=True, padx=(0, 10))
        header = tk.Frame(left, bg=SURFACE_2)
        header.pack(fill="x", padx=16, pady=(14, 9))
        _label(header, "完成記事プレビュー", size=13, bold=True).pack(side="left")
        _primary(app, header, "掲載用をコピー", lambda: _copy(app, article, "掲載用の記事をコピーしました。" )).pack(side="right")
        preview = tk.Text(left, wrap="word", bg="#F7F6F2", fg="#252525", relief="flat", padx=20, pady=16, height=24)
        preview.pack(fill="both", expand=True, padx=14, pady=(0, 10))
        _set_text(preview, article)
        _decorate_completion_preview(preview)
        preview.configure(state="disabled")
        fields["formatted_text"] = preview
        platform = str(_request_snapshot(app).get("platform") or "note")
        actions = tk.Frame(left, bg=SURFACE_2)
        actions.pack(fill="x", padx=14, pady=(0, 12))
        _secondary(app, actions, f"{platform}を開く", lambda: _open_platform(app, platform)).pack(side="left")
        image_panel = _card(page)
        image_panel.configure(width=330)
        image_panel.pack(side="right", fill="y")
        image_panel.pack_propagate(False)
        _refresh_image_result_panel(app, image_panel, {"formatted_text": preview, "final_text": preview})
        try:
            app.web_ai_bridge.mark_completed()
        except Exception:
            pass
        refresh_history()

    def complete_title_phase():
        raw = _text_value(fields.get("title_response"))
        candidates = _parse_title_candidates(raw)
        if not candidates:
            messagebox.showinfo("タイトル候補", "Web版AIのタイトル候補を貼り付けてください。")
            return
        state["candidates"] = candidates
        state["phase"] = 1
        fields["selected_title"].set(candidates[0])
        render_creation()

    def complete_selection_phase():
        selected = str(fields["selected_title"].get() or "").strip()
        if not selected:
            messagebox.showinfo("タイトル選択", "使用するタイトルを1つ選んでください。")
            return
        provider, quality, model = _provider_settings(app)
        raw = "\n".join(state["candidates"])
        try:
            result = app.web_ai_bridge.build_article_step(
                _request_snapshot(app), selected, provider=provider, quality=quality, model_label=model,
                title_candidates=list(state["candidates"]), title_response_raw=raw,
            )
        except Exception as exc:
            messagebox.showerror("記事作成", f"完成記事プロンプトを作成できませんでした。\n{exc}")
            return
        state["article_prompt"] = str(result.get("prompt") or "")
        state["phase"] = 2
        render_creation()

    def complete_article_phase():
        raw = _text_value(fields.get("article_response"))
        if not raw:
            messagebox.showinfo("完成記事", "Web版AIで作成した完成記事を貼り付けてください。")
            return
        expect_paid = str(_request_snapshot(app).get("article_type")) == "有料"
        try:
            result = app.web_ai_bridge.ingest_step(raw, expect_paid=expect_paid)
        except Exception as exc:
            messagebox.showerror("完成記事", f"記事を確認できませんでした。\n{exc}")
            return
        if not result.get("can_continue", True):
            issues = [str(item.get("message") or item.get("code") or "") for item in result.get("issues") or []]
            messagebox.showwarning("完成記事", "\n".join(item for item in issues if item) or "記事に修正が必要です。")
            return
        article = str(result.get("normalized_output") or raw).strip()
        platform = str(_request_snapshot(app).get("platform") or "note")
        try:
            app.web_ai_bridge.publish_step(article, platform=platform)
        except Exception as exc:
            messagebox.showerror("完成記事", f"掲載用の記事を準備できませんでした。\n{exc}")
            return
        state["article"] = article
        render_completion()
        show_page(5)

    def advance():
        index = int(state["index"])
        if index < 3:
            show_page(index + 1)
        elif index == 3:
            prepare_embedded_creation()
        elif index == 4:
            if state["phase"] == 0:
                complete_title_phase()
            elif state["phase"] == 1:
                complete_selection_phase()
            else:
                complete_article_phase()
        else:
            start_new()

    def go_back():
        index = int(state["index"])
        if index == 4 and state["phase"] > 0:
            state["phase"] -= 1
            render_creation()
        elif index > 0:
            show_page(index - 1)

    def configure_footer():
        index = int(state["index"])
        phase = int(state["phase"])
        back_button.configure(state="normal" if index > 0 else "disabled")
        clear_button.pack_forget()
        new_button.pack_forget()
        if index >= 4:
            clear_button.pack(side="left", padx=(0, 7), pady=9, after=back_button)
            new_button.pack(side="left", pady=9, after=clear_button)
        if index == 3:
            next_button.configure(text="作成へ  ›")
        elif index == 4:
            next_button.configure(text=("候補を確認  ›", "記事プロンプトへ  ›", "記事を確認  ›")[phase])
        elif index == 5:
            next_button.configure(text="新しい記事を作る")
        else:
            next_button.configure(text="次へ  ›")
        label = STEP_LABELS[index]
        if index == 4:
            label = ("タイトル準備", "タイトル選択", "完成記事を作成")[phase]
        status.configure(text=f"STEP {index + 1} / 6　{label}")

    def show_page(index):
        index = max(0, min(5, int(index)))
        for page in pages:
            _hide(page)
        state["index"] = index
        pages[index].pack(fill="both", expand=True)
        _update_progress(progress, index)
        configure_footer()
        try:
            body.update_idletasks()
            parent = body.master
            if hasattr(parent, "yview_moveto"):
                parent.yview_moveto(0.0)
        except Exception:
            pass

    app._v0431_article_wizard = {
        "root": root,
        "pages": pages,
        "show_page": show_page,
        "state": state,
        "fields": fields,
        "original_widgets": existing,
        "render_creation": render_creation,
        "render_completion": render_completion,
    }
    app._v0427_article_wizard = app._v0431_article_wizard
    app._article_create_body = body
    app._v0431_embedded_active = True
    app._v0431_activation_marker = ACTIVATION_MARKER
    refresh_history()
    show_page(0)
    return root


def _phase_heading(parent, number, title, subtitle):
    row = tk.Frame(parent, bg=SURFACE_2)
    row.pack(fill="x", pady=(3, 10))
    _label(row, number, size=8, bold=True, fg="#C4B5FD", bg="#291653").pack(side="left", padx=(0, 11), ipadx=8, ipady=7)
    text = tk.Frame(row, bg=SURFACE_2)
    text.pack(side="left", fill="x", expand=True)
    _label(text, title, size=11, bold=True).pack(anchor="w")
    _label(text, subtitle, size=7, fg=MUTED).pack(anchor="w", pady=(2, 0))


def activate_live_article_wizard(app):
    body = find_live_article_body(app)
    if body is None:
        app._v0431_embedded_active = False
        app._v0431_activation_error = "live_article_body_not_found"
        return None
    current = getattr(app, "_v0431_article_wizard", None)
    if current:
        try:
            root = current.get("root")
            if root and root.winfo_exists() and root.master is body:
                app._v0431_embedded_active = True
                return current
        except Exception:
            pass
    _hide_legacy_chrome(app, body)
    original = [child for child in body.winfo_children() if _manager(child)]
    install_article_wizard(app, body)
    wizard = getattr(app, "_v0431_article_wizard", None)
    if not wizard or not wizard.get("root") or len(wizard.get("pages") or ()) != 6:
        raise RuntimeError("同一画面の6ステップUIを初期化できませんでした。")
    if any(_manager(child) for child in original):
        raise RuntimeError("旧記事作成画面を非表示にできませんでした。")
    app._v0431_embedded_active = True
    app._v0431_activation_marker = ACTIVATION_MARKER
    app._v0431_activation_error = ""
    return wizard
