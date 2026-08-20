from __future__ import annotations

import re
import sys
from pathlib import Path


VERSION = "0.4.2.6"
MARKER = "# v0.4.2.6 embedded single-item article wizard"
V0425_MARKER = "# v0.4.2.5 guided article wizard and recent history"
OLD_CREATE_CALL = "        self._install_create_step_wizard(body)\n"
NEW_CREATE_CALL = "        self._install_single_item_article_wizard(body)\n"


EMBEDDED_HELPERS = r'''    # v0.4.2.6 embedded single-item article wizard
    def _wizard_descendant_text(self, widget):
        candidates = []
        try:
            widget_class = str(widget.winfo_class())
            if widget_class in {"Label", "TLabel", "Button", "TButton", "Checkbutton", "TCheckbutton"}:
                value = str(widget.cget("text") or "").strip()
                if 2 <= len(value) <= 42:
                    candidates.append(value)
            for child in widget.winfo_children():
                candidates.extend(self._wizard_descendant_text(child))
        except Exception:
            pass
        return candidates

    def _install_single_item_article_wizard(self, body):
        """Display one setup item at a time in the existing article-create page."""
        try:
            self._article_create_body = body
            original = [widget for widget in body.winfo_children() if widget.winfo_manager() == "pack"]
            if not original:
                return
            pack_options = {widget: self._wizard_pack_options(widget) for widget in original}
            web_card = getattr(self, "web_settings_card", None)
            image_card = getattr(self, "image_settings_card", None)
            ordered = []
            if image_card in original:
                ordered.append(image_card)
            if web_card in original and web_card not in ordered:
                ordered.append(web_card)
            ordered.extend(widget for widget in original if widget not in ordered)
            for widget in original:
                widget.pack_forget()

            intro = tk.Frame(body, bg=SURFACE_2, highlightthickness=1, highlightbackground="#2E315C")
            intro_options = {"fill": "x", "pady": (0, 12)}
            self._section_title(intro, "START", "生成方法を選択", "記事ごとに最初に選択します。選んだ後は『次へ』で画像計画へ進みます")
            generation_var = tk.StringVar(value=getattr(self, "_article_generation_method", "Web版AI（おすすめ）"))
            self._article_generation_method_var = generation_var
            choices = tk.Frame(intro, bg=SURFACE_2)
            choices.pack(fill="x", padx=22, pady=(2, 18))
            for label, description in (
                ("Web版AI（おすすめ）", "ChatGPT・Claude・Geminiへプロンプトをコピーして作成"),
                ("API", "API設定済みの場合に利用"),
                ("プロンプト書き出し", "プロンプトだけを作成して自分で利用"),
            ):
                row = tk.Frame(choices, bg="#111827", highlightthickness=1, highlightbackground="#263352")
                row.pack(fill="x", pady=4)
                tk.Radiobutton(row, text=label, value=label, variable=generation_var, command=lambda: setattr(self, "_article_generation_method", generation_var.get()), bg="#111827", fg=TEXT, activebackground="#111827", activeforeground=TEXT, selectcolor="#312E81", anchor="w", cursor="hand2").pack(anchor="w", padx=14, pady=(10, 2))
                self._label(row, description, size=8, fg=MUTED, bg="#111827").pack(anchor="w", padx=36, pady=(0, 10))

            pages = [intro, *ordered]
            pack_options[intro] = intro_options
            page_titles = ["生成方法を選択"]
            for index, widget in enumerate(ordered, start=1):
                if widget is image_card:
                    page_titles.append("完成記事を作る前の画像計画")
                elif widget is web_card:
                    page_titles.append("使用するWeb版AI")
                else:
                    texts = self._wizard_descendant_text(widget)
                    page_titles.append(texts[0] if texts else f"記事設定 {index}")

            header = tk.Frame(body, bg=BG, highlightthickness=1, highlightbackground="#263352")
            header.pack(fill="x", pady=(0, 10))
            progress = self._label(header, "", size=10, bold=True, fg="#93C5FD", bg=BG)
            progress.pack(side="left", padx=14, pady=10)
            self._label(header, "1項目ずつ設定します", size=8, fg=MUTED, bg=BG).pack(side="right", padx=14, pady=10)

            footer = tk.Frame(body, bg=BG)
            footer.pack(fill="x", pady=(10, 14))
            current = {"index": 0}

            def show_page(index):
                index = max(0, min(int(index), len(pages) - 1))
                for page in pages:
                    try:
                        page.pack_forget()
                    except Exception:
                        pass
                current["index"] = index
                page = pages[index]
                options = dict(pack_options.get(page) or {"fill": "x", "pady": (0, 12)})
                options.pop("expand", None)
                page.pack(before=footer, **options)
                progress.configure(text=f"STEP {index + 1}/{len(pages)}　{page_titles[index]}")
                back_btn.configure(state=("normal" if index > 0 else "disabled"))
                next_btn.configure(state=("normal" if index < len(pages) - 1 else "disabled"))
                next_btn.configure(text=("次へ" if index < len(pages) - 1 else "設定完了"))
                try:
                    body.update_idletasks()
                    parent = body.master
                    if hasattr(parent, "yview_moveto"):
                        parent.yview_moveto(0.0)
                except Exception:
                    pass

            back_btn = self._secondary_button(footer, "戻る", lambda: show_page(current["index"] - 1))
            back_btn.pack(side="left")
            next_btn = self._primary_button(footer, "次へ", lambda: show_page(current["index"] + 1))
            next_btn.pack(side="right")
            self._single_item_wizard = {
                "pages": pages,
                "header": header,
                "footer": footer,
                "pack_options": pack_options,
                "show_page": show_page,
            }
            show_page(0)
        except Exception:
            return

    def _create_embedded_article_workspace(self):
        """Create the Web AI workflow inside the main article page, never in a Toplevel."""
        body = getattr(self, "_article_create_body", None)
        if body is None:
            raise RuntimeError("記事作成画面を初期化できませんでした。いったん『記事を作る』を開き直してください。")
        previous = []
        for widget in body.winfo_children():
            try:
                manager = widget.winfo_manager()
                if manager == "pack":
                    options = self._wizard_pack_options(widget) or {"fill": "x"}
                    previous.append((widget, options))
                    widget.pack_forget()
            except Exception:
                pass
        host = tk.Frame(body, bg=BG)
        host.pack(fill="both", expand=True)
        self._embedded_article_host = host
        self._embedded_article_previous = previous

        toolbar = tk.Frame(host, bg=BG)
        toolbar.pack(fill="x", padx=12, pady=(6, 4))
        self._secondary_button(toolbar, "← 設定に戻る", self._restore_article_setup).pack(side="left")
        self._label(toolbar, "同じ記事作成画面の中で進行しています", size=8, fg="#86EFAC", bg=BG).pack(side="left", padx=12)

        real_destroy = host.destroy
        host._real_destroy = real_destroy
        host.title = lambda *args, **kwargs: None
        host.geometry = lambda *args, **kwargs: None
        host.minsize = lambda *args, **kwargs: None
        host.resizable = lambda *args, **kwargs: None
        host.transient = lambda *args, **kwargs: None
        host.grab_set = lambda *args, **kwargs: None
        host.protocol = lambda *args, **kwargs: None
        host.attributes = lambda *args, **kwargs: None
        host.state = lambda *args, **kwargs: None
        host.destroy = self._restore_article_setup
        return host

    def _restore_article_setup(self):
        host = getattr(self, "_embedded_article_host", None)
        previous = list(getattr(self, "_embedded_article_previous", []) or [])
        if host is not None:
            try:
                real_destroy = getattr(host, "_real_destroy", None)
                if real_destroy:
                    real_destroy()
            except Exception:
                pass
        self._embedded_article_host = None
        for widget, options in previous:
            try:
                if widget.winfo_exists():
                    clean = dict(options or {"fill": "x"})
                    for key in ("in", "before", "after"):
                        clean.pop(key, None)
                    widget.pack(**clean)
            except Exception:
                pass
        wizard = getattr(self, "_single_item_wizard", None)
        if wizard:
            try:
                wizard["show_page"](len(wizard["pages"]) - 1)
            except Exception:
                pass

'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return text.replace(old, new, 1)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0426.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        print("v0.4.2.6 embedded single-item article wizard already applied")
        return
    if V0425_MARKER not in text:
        raise RuntimeError("v0.4.2.5 UI marker missing")

    helper_anchor = "    # v0.4.2.5 guided article wizard and recent history\n"
    text = replace_once(text, helper_anchor, EMBEDDED_HELPERS + helper_anchor, "v0.4.2.6 helpers")
    text = replace_once(text, OLD_CREATE_CALL, NEW_CREATE_CALL, "single-item setup wizard")
    method_start = text.find("    def _open_web_ai_mode(self):\n")
    if method_start < 0:
        raise RuntimeError("embedded Web AI workspace: method anchor missing")
    method_end = text.find("\n    def ", method_start + 5)
    if method_end < 0:
        method_end = len(text)
    method = text[method_start:method_end]
    method, count = re.subn(
        r"(?m)^(\s*)win\s*=\s*tk\.Toplevel\(self\)\s*$",
        lambda match: match.group(1) + "win = self._create_embedded_article_workspace()",
        method,
        count=1,
    )
    if count != 1:
        raise RuntimeError(f"embedded Web AI workspace: expected exactly one Toplevel anchor, got {count}")
    text = text[:method_start] + method + text[method_end:]
    compile(text, str(app), "exec")
    app.write_text(text, encoding="utf-8", newline="\n")
    print(f"v{VERSION} embedded single-item article wizard applied")


if __name__ == "__main__":
    main()
