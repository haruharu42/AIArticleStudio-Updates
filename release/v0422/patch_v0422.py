from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

MARKER = "# v0.4.2.2 linked image controls"
TOP_IMAGE_PACK = '        self.image_settings_card.pack(fill="x", pady=(0,12))\n'
OLD_STYLE_VALUES = 'values=["おまかせ","ビジネス","テック","やさしい","図解風"]'
NEW_STYLE_VALUES = 'values=["おまかせ","アニメ風","漫画風","ビジネス","テック","やさしい","図解風","ポップ風","高級感","サムネ映え重視","ナチュラル","ミニマル","インフォグラフィック"]'
OLD_STYLE_MAP = 'style_map = {"おまかせ":"auto", "ビジネス":"business", "テック":"tech", "やさしい":"gentle", "図解風":"diagram"}'
NEW_STYLE_MAP = 'style_map = {"おまかせ":"auto", "ビジネス":"business", "テック":"tech", "やさしい":"gentle", "図解風":"diagram", "アニメ風":"anime", "漫画風":"manga", "ポップ風":"pop", "高級感":"luxury", "サムネ映え重視":"catchy_thumbnail", "ナチュラル":"natural_blog", "ミニマル":"minimal", "インフォグラフィック":"infographic"}'
OLD_PUBLISH_IMAGE_BUTTON = '        self._secondary_button(publish_links,"画像プロンプト",self._show_image_prompts).pack(side="left",padx=4)\n'
CONTROLS_ANCHOR = '        controls4=tk.Frame(step4,bg=SURFACE); controls4.pack(fill="x",padx=18,pady=(0,14))\n'
CORE_FILES = (
    "image_settings.py",
    "image_prompt_builder.py",
    "web_ai_workflow.py",
    "web_ai_ui_bridge.py",
)

LINKED_PANEL = r'''        # v0.4.2.2 linked image controls
        linked_image_card=tk.Frame(step4,bg="#151C2F",highlightthickness=1,highlightbackground="#2E315C")
        linked_image_card.pack(fill="x",padx=18,pady=(0,14))
        self._label(linked_image_card,"記事に合う画像を作る",size=11,bold=True,fg=TEXT,bg="#151C2F").pack(anchor="w",padx=14,pady=(12,3))
        self._label(linked_image_card,"Web版で取り込んだ完成記事・タイトル・見出しを使って、関連するアイキャッチと挿絵のプロンプトを作ります。",size=8,fg=SOFT,bg="#151C2F",wraplength=820,justify="left").pack(anchor="w",padx=14,pady=(0,9))
        image_link_grid=tk.Frame(linked_image_card,bg="#151C2F")
        image_link_grid.pack(fill="x",padx=14,pady=(0,8))
        image_link_grid.grid_columnconfigure(1,weight=1); image_link_grid.grid_columnconfigure(3,weight=1)
        tk.Checkbutton(image_link_grid,text="画像を作る",variable=self.vars["image_enabled"],bg="#151C2F",fg=TEXT,activebackground="#151C2F",activeforeground=TEXT,selectcolor="#111827").grid(row=0,column=0,sticky="w",pady=5)
        self._label(image_link_grid,"作る画像",size=8,fg=SOFT,bg="#151C2F").grid(row=0,column=2,sticky="w",padx=(14,6),pady=5)
        ttk.Combobox(image_link_grid,textvariable=self.vars["image_target"],values=["アイキャッチ＋挿絵","アイキャッチのみ","挿絵のみ"],state="readonly",style="Dark.TCombobox").grid(row=0,column=3,sticky="ew",pady=5)
        self._label(image_link_grid,"デザイン",size=8,fg=SOFT,bg="#151C2F").grid(row=1,column=0,sticky="w",pady=5)
        ttk.Combobox(image_link_grid,textvariable=self.vars["image_style"],values=["おまかせ","アニメ風","漫画風","ビジネス","テック","やさしい","図解風","ポップ風","高級感","サムネ映え重視","ナチュラル","ミニマル","インフォグラフィック"],state="readonly",style="Dark.TCombobox").grid(row=1,column=1,sticky="ew",padx=(8,0),pady=5)
        self._label(image_link_grid,"挿絵の枚数",size=8,fg=SOFT,bg="#151C2F").grid(row=1,column=2,sticky="w",padx=(14,6),pady=5)
        ttk.Combobox(image_link_grid,textvariable=self.vars["image_count"],values=["自動","1","2","3"],state="readonly",style="Dark.TCombobox").grid(row=1,column=3,sticky="ew",pady=5)
        self._label(image_link_grid,"作り方",size=8,fg=SOFT,bg="#151C2F").grid(row=2,column=0,sticky="w",pady=5)
        ttk.Combobox(image_link_grid,textvariable=self.vars["image_mode"],values=["Web版（おすすめ）","API版（準備中）","ローカルGPU（準備中）"],state="readonly",style="Dark.TCombobox").grid(row=2,column=1,sticky="ew",padx=(8,0),pady=5)
        tk.Checkbutton(image_link_grid,text="おすすめの差し込み位置を本文に記載",variable=self.vars["image_insert_markers"],bg="#151C2F",fg=SOFT,activebackground="#151C2F",activeforeground=TEXT,selectcolor="#111827").grid(row=2,column=2,columnspan=2,sticky="w",padx=(14,0),pady=5)
        self._label(linked_image_card,"記事内容との連携：ON｜掲載用整形後の本文を優先し、無ければ取り込み済み本文を参照します。挿絵マーカーが無い記事でも見出しから候補位置を提案します。",size=8,fg="#93C5FD",bg="#151C2F",wraplength=820,justify="left").pack(anchor="w",padx=14,pady=(0,8))
        linked_image_actions=tk.Frame(linked_image_card,bg="#151C2F")
        linked_image_actions.pack(fill="x",padx=14,pady=(0,12))
        self._primary_button(linked_image_actions,"画像プロンプトを作る",lambda:self._show_image_prompts((formatted_text.get("1.0","end").strip() or final_text.get("1.0","end").strip()))).pack(side="left")
        self._secondary_button(linked_image_actions,"GPUを確認",self._show_gpu_diagnostic).pack(side="left",padx=(8,0))

'''

NEW_SHOW_METHOD = r'''    def _show_image_prompts(self, article_text=None):
        self._sync_image_settings()
        try:
            data = self.web_ai_bridge.build_image_prompts(article_text=article_text)
        except Exception as e:
            messagebox.showwarning("画像プロンプト", f"画像プロンプトを作成できませんでした。\n{e}")
            return
        errors = [str(x).strip() for x in (data.get("errors") or []) if str(x).strip()]
        if errors:
            messagebox.showinfo("画像を作る準備", "画像プロンプトを作るには、次を確認してください。\n\n" + "\n".join("・" + x for x in errors))
            return
        eye = str(data.get("eyecatch_prompt") or "").strip()
        inline = list(data.get("illustration_prompts") or [])
        if not eye and not inline:
            messagebox.showinfo("画像プロンプト", "画像の作成対象を選び、完成記事を取り込んでからもう一度お試しください。")
            return
        title = str(data.get("selected_title") or "記事").strip()
        style = str(data.get("style_label") or "おまかせ").strip()
        source = str(data.get("article_source") or "none")
        marker_source = str(data.get("marker_source") or "none")
        source_label = {"formatted_output":"掲載用整形後本文", "normalized_output":"取り込み済み本文", "raw_web_output":"Web版AI回答", "ui_current_text":"現在表示中の記事"}.get(source, "記事本文")
        marker_note = "本文中の挿絵マーカーを使用" if marker_source == "explicit" else ("記事の見出しから挿絵位置を自動提案" if marker_source == "derived_from_article" else "アイキャッチのみ")
        parts = [f"【記事】{title}", f"【デザイン】{style}", f"【連携元】{source_label} / {marker_note}"]
        if eye:
            parts += ["【アイキャッチ用プロンプト】", eye]
        for item in inline:
            parts += [f"【{item.get('label','挿絵')}用プロンプト】", str(item.get("prompt") or "").strip()]
        summary = str(data.get("illustration_summary") or "").strip()
        if summary:
            parts += [summary]
        combined = "\n\n".join(x for x in parts if x)
        win = tk.Toplevel(self)
        win.title("記事連動 画像プロンプト")
        win.geometry("940x680")
        win.configure(bg=BG)
        self._label(win, "記事に合うアイキャッチ・挿絵", size=14, bold=True, fg=TEXT, bg=BG).pack(anchor="w", padx=18, pady=(16,4))
        self._label(win, f"{title}｜{style}｜{source_label}", size=8, fg="#93C5FD", bg=BG).pack(anchor="w", padx=18, pady=(0,8))
        self._label(win, "Web版AIへコピーして画像を作成してください。記事本文の内容と挿絵位置を優先したプロンプトです。", size=8, fg=SOFT, bg=BG).pack(anchor="w", padx=18, pady=(0,10))
        box = tk.Text(win, wrap="word", bg=SURFACE, fg=TEXT, insertbackground=TEXT, relief="flat")
        box.pack(fill="both", expand=True, padx=18, pady=(0,10))
        box.insert("1.0", combined)
        row = tk.Frame(win, bg=BG)
        row.pack(fill="x", padx=18, pady=(0,16))
        def copy_all():
            self.clipboard_clear(); self.clipboard_append(combined); self.update()
            messagebox.showinfo("コピー", "記事連動の画像プロンプトをコピーしました。")
        self._primary_button(row, "すべてコピー", copy_all).pack(side="left")
        self._secondary_button(row, "ChatGPT", lambda:self._open_web_ai_site("ChatGPT")).pack(side="left", padx=(8,0))
        self._secondary_button(row, "Claude", lambda:self._open_web_ai_site("Claude")).pack(side="left", padx=(6,0))
        self._secondary_button(row, "Gemini", lambda:self._open_web_ai_site("Gemini")).pack(side="left", padx=(6,0))

'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return text.replace(old, new, 1)


def replace_show_method(text: str) -> str:
    pattern = re.compile(r"    def _show_image_prompts\(self\):\n.*?(?=    def _genre_changed\(self, _event=None\):\n)", re.S)
    new, count = pattern.subn(NEW_SHOW_METHOD, text, count=1)
    if count != 1:
        raise RuntimeError(f"image prompt method: expected exactly one block, got {count}")
    return new


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: patch_v0422.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    core_dst = install / "src" / "ai_article_studio" / "core"
    core_src = package / "payload" / "core"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    if not core_src.is_dir():
        raise RuntimeError("v0.4.2.2 payload/core not found")

    core_dst.mkdir(parents=True, exist_ok=True)
    for name in CORE_FILES:
        src = core_src / name
        if not src.is_file():
            raise RuntimeError(f"required payload core file missing: {name}")
        shutil.copy2(src, core_dst / name)

    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        print("v0.4.2.2 linked image UI already applied")
        return

    # v0.4.2.1 made the original card visible at the top. v0.4.2.2 moves
    # controls into the Web article preview flow, so remove that top-level pack.
    text = replace_once(text, TOP_IMAGE_PACK, "", "top image settings pack")
    if OLD_STYLE_VALUES in text:
        text = text.replace(OLD_STYLE_VALUES, NEW_STYLE_VALUES, 1)
    text = replace_once(text, OLD_STYLE_MAP, NEW_STYLE_MAP, "image style map")
    text = replace_show_method(text)
    text = replace_once(text, CONTROLS_ANCHOR, LINKED_PANEL + CONTROLS_ANCHOR, "linked image panel")
    if OLD_PUBLISH_IMAGE_BUTTON in text:
        text = text.replace(OLD_PUBLISH_IMAGE_BUTTON, "", 1)

    app.write_text(text, encoding="utf-8", newline="\n")
    print("v0.4.2.2 linked image controls applied")


if __name__ == "__main__":
    main()
