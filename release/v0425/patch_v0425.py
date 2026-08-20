from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path


VERSION = "0.4.2.5"
MARKER = "# v0.4.2.5 guided article wizard and recent history"
CORE_FILES = ("web_ai_state.py", "web_ai_ui_bridge.py")
IMAGE_PLAN_ANCHOR = "\n    def _collect_image_settings(self):"
IMAGE_PROMPT_BUTTON = '        self._secondary_button(publish_links,"画像プロンプト",lambda:self._show_image_prompts((formatted_text.get("1.0","end").strip() or final_text.get("1.0","end").strip()))).pack(side="left",padx=4)\n'


WIZARD_HELPERS = r'''    # v0.4.2.5 guided article wizard and recent history
    def _wizard_pack_options(self, widget):
        try:
            if widget.winfo_manager() != "pack":
                return None
            options = dict(widget.pack_info())
        except Exception:
            return None
        for key in ("in", "before", "after"):
            options.pop(key, None)
        return options

    def _widget_has_create_action(self, widget):
        try:
            widget_class = str(widget.winfo_class())
            text = str(widget.cget("text") or "") if widget_class in {"Button", "TButton"} else ""
            if any(label in text for label in ("記事を作成", "記事作成", "プロンプトを書き出", "Web版AIで作成")):
                return True
            return any(self._widget_has_create_action(child) for child in widget.winfo_children())
        except Exception:
            return False

    def _install_create_step_wizard(self, body):
        """Turn the long create form into short sequential pages without rebuilding its fields."""
        try:
            managed = [widget for widget in body.winfo_children() if widget.winfo_manager() == "pack"]
            web_card = getattr(self, "web_settings_card", None)
            image_card = getattr(self, "image_settings_card", None)
            if len(managed) < 3 or web_card not in managed or image_card not in managed:
                return
            pack_options = {widget: self._wizard_pack_options(widget) for widget in managed}
            web_index = managed.index(web_card)
            generation_page = managed[: web_index + 1]
            remaining = [widget for widget in managed if widget not in generation_page and widget is not image_card]
            actions = [widget for widget in remaining if self._widget_has_create_action(widget)]
            article_page = [widget for widget in remaining if widget not in actions]
            image_page = [image_card, *actions]
            pages = [page for page in (generation_page, article_page, image_page) if page]
            if len(pages) < 2:
                return

            for widget in managed:
                widget.pack_forget()
            header = tk.Frame(body, bg=BG, highlightthickness=1, highlightbackground="#263352")
            header.pack(fill="x", pady=(0, 10))
            progress = self._label(header, "", size=10, bold=True, fg="#93C5FD", bg=BG)
            progress.pack(side="left", padx=14, pady=10)
            note = self._label(header, "1画面ずつ設定します。入力内容は記事作成時に自動保存されます。", size=8, fg=MUTED, bg=BG)
            note.pack(side="right", padx=14, pady=10)

            footer = tk.Frame(body, bg=BG)
            footer.pack(fill="x", pady=(10, 14))
            current = {"index": 0}
            titles = ["生成方法", "記事設定", "画像設定"]

            def show_page(index):
                index = max(0, min(int(index), len(pages) - 1))
                for page in pages:
                    for widget in page:
                        try:
                            widget.pack_forget()
                        except Exception:
                            pass
                current["index"] = index
                for widget in pages[index]:
                    options = dict(pack_options.get(widget) or {"fill": "x", "pady": (0, 10)})
                    widget.pack(before=footer, **options)
                label = titles[index] if index < len(titles) else f"設定 {index + 1}"
                progress.configure(text=f"STEP {index + 1}/{len(pages)}　{label}")
                back_btn.configure(state=("normal" if index > 0 else "disabled"))
                next_btn.configure(state=("normal" if index < len(pages) - 1 else "disabled"))
                next_btn.configure(text=("次へ" if index < len(pages) - 2 else "画像設定へ"))
                try:
                    body.update_idletasks()
                    canvas = body.master
                    if hasattr(canvas, "yview_moveto"):
                        canvas.yview_moveto(0.0)
                except Exception:
                    pass

            back_btn = self._secondary_button(footer, "戻る", lambda: show_page(current["index"] - 1))
            back_btn.pack(side="left")
            next_btn = self._primary_button(footer, "次へ", lambda: show_page(current["index"] + 1))
            next_btn.pack(side="right")
            self._create_wizard_show_page = show_page
            show_page(0)
        except Exception:
            # The existing form remains usable if an older custom layout cannot be grouped safely.
            return

    def _install_web_ai_article_wizard(self, win, req, pages, fields):
        """Show one Web-AI production step at a time and provide local recent-history access."""
        pages = [page for page in pages if page is not None]
        if not pages:
            return
        pack_options = {page: self._wizard_pack_options(page) for page in pages}
        if not any(pack_options.values()):
            return
        for page in pages:
            try:
                page.pack_forget()
            except Exception:
                pass

        header = tk.Frame(win, bg=BG, highlightthickness=1, highlightbackground="#263352")
        first_page = pages[0]
        try:
            header.pack(fill="x", padx=14, pady=(8, 8), before=first_page)
        except Exception:
            header.pack(fill="x", padx=14, pady=(8, 8))
        progress = self._label(header, "", size=10, bold=True, fg="#93C5FD", bg=BG)
        progress.pack(side="left", padx=12, pady=9)
        self._label(header, "戻る／次へで進みます", size=8, fg=MUTED, bg=BG).pack(side="right", padx=12, pady=9)

        history_panel = tk.Frame(win, bg=SURFACE_2, width=270, highlightthickness=1, highlightbackground="#263352")
        history_panel.pack(side="right", fill="y", padx=(0, 12), pady=(0, 10))
        history_panel.pack_propagate(False)
        self._label(history_panel, "最近の作業（最大10件）", size=10, bold=True, fg=TEXT, bg=SURFACE_2).pack(anchor="w", padx=12, pady=(12, 3))
        self._label(history_panel, "選択すると現在の作業を保存して切り替えます", size=7, fg=MUTED, bg=SURFACE_2, wraplength=238, justify="left").pack(anchor="w", padx=12, pady=(0, 8))
        history_list = tk.Frame(history_panel, bg=SURFACE_2)
        history_list.pack(fill="both", expand=True, padx=8)

        footer = tk.Frame(win, bg=BG)
        footer.pack(side="bottom", fill="x", padx=14, pady=(0, 12))
        current = {"index": 0}
        labels = ["タイトル準備", "タイトル選択", "完成記事作成", "記事確認・出力"]

        def text_get(name):
            widget = fields.get(name)
            if widget is None:
                return ""
            try:
                return widget.get("1.0", "end").strip()
            except Exception:
                return ""

        def text_set(name, value):
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

        def capture_draft():
            try:
                self.web_ai_bridge.save_editor_draft(
                    raw_text=text_get("final_text"),
                    formatted_text=text_get("formatted_text"),
                )
            except Exception:
                pass

        def show_page(index):
            capture_draft()
            index = max(0, min(int(index), len(pages) - 1))
            for page in pages:
                try:
                    page.pack_forget()
                except Exception:
                    pass
            current["index"] = index
            options = dict(pack_options.get(pages[index]) or {"fill": "both", "expand": True})
            options.pop("expand", None)
            pages[index].pack(fill=options.pop("fill", "both"), expand=True, padx=options.pop("padx", 14), pady=options.pop("pady", (0, 10)), **options)
            label = labels[index] if index < len(labels) else f"記事作成 {index + 1}"
            progress.configure(text=f"STEP {index + 1}/{len(pages)}　{label}")
            back_btn.configure(state=("normal" if index > 0 else "disabled"))
            next_btn.configure(state=("normal" if index < len(pages) - 1 else "disabled"))
            refresh_history()

        def apply_snapshot(snapshot):
            request = dict(snapshot.get("article_request") or {})
            for key, value in request.items():
                variable = self.vars.get(key)
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
            text_set("paste_titles", snapshot.get("title_response_raw") or "")
            text_set("final_text", snapshot.get("raw_web_output") or snapshot.get("normalized_output") or "")
            text_set("formatted_text", snapshot.get("formatted_output") or "")
            step_index = {"00": 0, "01": 0, "02": 0, "03": min(2, len(pages) - 1), "04": len(pages) - 1, "05": len(pages) - 1}.get(str(snapshot.get("current_step") or "00"), 0)
            show_page(step_index)

        def load_history(article_id):
            capture_draft()
            try:
                snapshot = self.web_ai_bridge.load_history(article_id)
            except Exception as exc:
                messagebox.showwarning("最近の作業", f"履歴を読み込めませんでした。\n{exc}")
                return
            if snapshot:
                apply_snapshot(snapshot)

        def delete_history(article_id):
            if not messagebox.askyesno("履歴を削除", "この作業履歴を一覧から削除しますか？"):
                return
            try:
                current_snapshot = self.web_ai_bridge.current_snapshot()
                was_current = str(current_snapshot.get("article_id") or "") == str(article_id or "")
                self.web_ai_bridge.delete_history(article_id)
                if was_current:
                    self.web_ai_bridge.new_article()
                    text_set("paste_titles", "")
                    text_set("final_text", "")
                    text_set("formatted_text", "")
                    selected = fields.get("selected_title")
                    if selected is not None:
                        selected.set("")
                    show_page(0)
            except Exception as exc:
                messagebox.showwarning("履歴を削除", f"履歴を削除できませんでした。\n{exc}")
            refresh_history()

        def refresh_history():
            for child in history_list.winfo_children():
                child.destroy()
            try:
                items = self.web_ai_bridge.history_items(10)
            except Exception:
                items = []
            if not items:
                self._label(history_list, "履歴はまだありません", size=8, fg=MUTED, bg=SURFACE_2).pack(anchor="w", padx=4, pady=8)
                return
            for item in items:
                row = tk.Frame(history_list, bg="#111827", highlightthickness=1, highlightbackground="#263352")
                row.pack(fill="x", pady=3)
                title = str(item.get("title") or "新しい記事")
                if len(title) > 23:
                    title = title[:22] + "…"
                meta = f"{item.get('status', '作成中')}｜STEP {item.get('step', '00')}｜{item.get('platform', 'note')}"
                tk.Button(row, text=title + "\n" + meta, command=lambda article_id=item.get("article_id", ""): load_history(article_id), bg="#111827", fg=TEXT, activebackground="#1E293B", activeforeground=TEXT, relief="flat", anchor="w", justify="left", cursor="hand2").pack(side="left", fill="x", expand=True, padx=(5, 0), pady=4)
                tk.Button(row, text="×", command=lambda article_id=item.get("article_id", ""): delete_history(article_id), bg="#111827", fg=MUTED, activebackground="#7F1D1D", activeforeground=TEXT, relief="flat", cursor="hand2").pack(side="right", padx=4)

        def clear_paste():
            text_set("final_text", "")
            text_set("formatted_text", "")
            try:
                self.web_ai_bridge.clear_article_content()
            except Exception as exc:
                messagebox.showwarning("貼り付け欄をクリア", f"入力欄をクリアできませんでした。\n{exc}")
            refresh_history()

        def new_article():
            capture_draft()
            try:
                self.web_ai_bridge.new_article()
            except Exception as exc:
                messagebox.showwarning("新しい記事", f"新しい記事を開始できませんでした。\n{exc}")
                return
            text_set("paste_titles", "")
            text_set("final_text", "")
            text_set("formatted_text", "")
            selected = fields.get("selected_title")
            if selected is not None:
                try:
                    selected.set("")
                except Exception:
                    pass
            show_page(0)
            refresh_history()

        self._secondary_button(footer, "戻る", lambda: show_page(current["index"] - 1)).pack(side="left")
        back_btn = footer.winfo_children()[-1]
        self._secondary_button(footer, "貼り付け欄をクリア", clear_paste).pack(side="left", padx=(8, 0))
        self._secondary_button(footer, "新しい記事", new_article).pack(side="left", padx=(8, 0))
        next_btn = self._primary_button(footer, "次へ", lambda: show_page(current["index"] + 1))
        next_btn.pack(side="right")
        try:
            win.geometry("1180x760")
            win.minsize(980, 680)
        except Exception:
            pass
        refresh_history()
        snapshot = self.web_ai_bridge.current_snapshot()
        step_index = {"00": 0, "01": 0, "02": 0, "03": min(2, len(pages) - 1), "04": len(pages) - 1, "05": len(pages) - 1}.get(str(snapshot.get("current_step") or "00"), 0)
        show_page(step_index)

'''


WEB_WIZARD_CALL = r'''        self._install_web_ai_article_wizard(
            win,
            req,
            [page for page in (locals().get("step1"), locals().get("step2"), locals().get("step3"), locals().get("step4")) if page is not None],
            {
                "paste_titles": locals().get("paste_titles"),
                "selected_title": locals().get("selected_title"),
                "final_text": locals().get("final_text"),
                "formatted_text": locals().get("formatted_text"),
            },
        )
'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return text.replace(old, new, 1)


def validate_payload(core_src: Path) -> None:
    for name in CORE_FILES:
        source = core_src / name
        if not source.is_file():
            raise RuntimeError(f"required payload core file missing: {name}")
        compile(source.read_text(encoding="utf-8"), str(source), "exec")


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0425.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    core_dst = install / "src" / "ai_article_studio" / "core"
    core_src = package / "payload" / "core"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    if not core_dst.is_dir() or not core_src.is_dir():
        raise RuntimeError("v0.4.2.5 core directory missing")
    validate_payload(core_src)

    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        print("v0.4.2.5 guided article wizard already applied")
        return
    if "# v0.4.2.4 pre-article image planning controls" not in text:
        raise RuntimeError("v0.4.2.4 UI marker missing")

    text = replace_once(
        text,
        IMAGE_PLAN_ANCHOR,
        "\n        self._install_create_step_wizard(body)\n\n" + WIZARD_HELPERS + "    def _collect_image_settings(self):",
        "create wizard installation",
    )
    text = replace_once(
        text,
        IMAGE_PROMPT_BUTTON,
        IMAGE_PROMPT_BUTTON + WEB_WIZARD_CALL,
        "Web AI wizard installation",
    )
    compile(text, str(app), "exec")
    app.write_text(text, encoding="utf-8", newline="\n")
    for name in CORE_FILES:
        shutil.copy2(core_src / name, core_dst / name)
    print(f"v{VERSION} guided article wizard and recent history applied")


if __name__ == "__main__":
    main()
