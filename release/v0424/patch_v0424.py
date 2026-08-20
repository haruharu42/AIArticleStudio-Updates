from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

VERSION = "0.4.2.4"
MARKER = "# v0.4.2.4 pre-article image planning controls"
CONTROLS_ANCHOR = '        controls4=tk.Frame(step4,bg=SURFACE); controls4.pack(fill="x",padx=18,pady=(0,14))\n'
BRAIN_ANCHOR = '        self._secondary_button(publish_links,"Brain",lambda:self._open_publish_platform("Brain")).pack(side="left",padx=4)\n'
ARTICLE_PROMPT_ANCHOR = '            _article_step = self.web_ai_bridge.build_article_step(\n'
CORE_FILES = (
    "image_settings.py",
    "image_prompt_builder.py",
    "web_prompt_engine_v2.py",
    "web_ai_workflow.py",
)

IMAGE_CARD = r'''        # v0.4.2.2 linked image controls (migrated before article creation)
        # v0.4.2.4 pre-article image planning controls
        self.image_settings_card = self.card(body, bg=SURFACE_2)
        self.image_settings_card.pack(fill="x", pady=(0,12))
        self._section_title(self.image_settings_card, "IMAGE PLAN", "完成記事を作る前の画像計画", "記事完成後に本文全体を確認し、関連するアイキャッチと必要最小限の挿絵を準備します")
        imagegrid = tk.Frame(self.image_settings_card, bg=SURFACE_2)
        imagegrid.pack(fill="x", padx=20, pady=(0, 12))
        imagegrid.grid_columnconfigure(1, weight=1)
        imagegrid.grid_columnconfigure(3, weight=1)
        self.vars["image_eyecatch_enabled"] = tk.BooleanVar(value=True)
        self.vars["image_illustrations_enabled"] = tk.BooleanVar(value=False)
        self.vars["image_enabled"] = tk.BooleanVar(value=True)
        self.vars["image_target"] = tk.StringVar(value="アイキャッチのみ")
        self.vars["image_mode"] = tk.StringVar(value="Web版（おすすめ）")
        self.vars["image_style"] = tk.StringVar(value="おまかせ")
        self.vars["image_count"] = tk.StringVar(value="AIにおまかせ")
        self.vars["image_insert_markers"] = tk.BooleanVar(value=True)

        tk.Checkbutton(imagegrid, text="アイキャッチを作成（noteなどでは推奨）", variable=self.vars["image_eyecatch_enabled"], command=self._update_image_plan_controls, bg=SURFACE_2, fg=TEXT, activebackground=SURFACE_2, activeforeground=TEXT, selectcolor="#111827").grid(row=0, column=0, columnspan=2, sticky="w", pady=6)
        tk.Checkbutton(imagegrid, text="記事内の挿絵を作成", variable=self.vars["image_illustrations_enabled"], command=self._update_image_plan_controls, bg=SURFACE_2, fg=TEXT, activebackground=SURFACE_2, activeforeground=TEXT, selectcolor="#111827").grid(row=0, column=2, columnspan=2, sticky="w", padx=(16,0), pady=6)

        self._label(imagegrid, "デザイン", size=9, fg=SOFT, bg=SURFACE_2).grid(row=1, column=0, sticky="w", pady=6)
        ttk.Combobox(imagegrid, textvariable=self.vars["image_style"], values=["おまかせ","アニメ風","漫画風","ビジネス","テック","やさしい","図解風","ポップ風","高級感","サムネ映え重視","ナチュラル","ミニマル","インフォグラフィック"], state="readonly", style="Dark.TCombobox").grid(row=1, column=1, sticky="ew", padx=(8,0), pady=6)
        self._label(imagegrid, "挿絵の枚数", size=9, fg=SOFT, bg=SURFACE_2).grid(row=1, column=2, sticky="w", padx=(16,8), pady=6)
        self.image_count_cb = ttk.Combobox(imagegrid, textvariable=self.vars["image_count"], values=["AIにおまかせ","1","2","3","4","5","6"], state="readonly", style="Dark.TCombobox")
        self.image_count_cb.grid(row=1, column=3, sticky="ew", pady=6)

        self._label(imagegrid, "作り方", size=9, fg=SOFT, bg=SURFACE_2).grid(row=2, column=0, sticky="w", pady=6)
        image_mode_cb = ttk.Combobox(imagegrid, textvariable=self.vars["image_mode"], values=["Web版（おすすめ）","API版（準備中）","ローカルGPU（準備中）"], state="readonly", style="Dark.TCombobox")
        image_mode_cb.grid(row=2, column=1, sticky="ew", padx=(8,0), pady=6)
        image_mode_cb.bind("<<ComboboxSelected>>", self._image_mode_changed)
        self._label(imagegrid, "挿絵ON時は、AIが記事全体から必要枚数と差し込み位置を判断（上限6枚）", size=8, fg="#93C5FD", bg=SURFACE_2, wraplength=470, justify="left").grid(row=2, column=2, columnspan=2, sticky="w", padx=(16,0), pady=6)

        self.image_plan_note = self._label(imagegrid, "", size=8, fg="#86EFAC", bg=SURFACE_2, wraplength=760, justify="left")
        self.image_plan_note.grid(row=3, column=0, columnspan=4, sticky="w", pady=(7,3))
        self.image_mode_note = self._label(imagegrid, "Web版：完成記事の本文・見出しを確認して画像用プロンプトを作成します。", size=8, fg=MUTED, bg=SURFACE_2, wraplength=760, justify="left")
        self.image_mode_note.grid(row=4, column=0, columnspan=4, sticky="w", pady=(3,4))
        image_actions = tk.Frame(self.image_settings_card, bg=SURFACE_2)
        image_actions.pack(fill="x", padx=20, pady=(0,16))
        self._secondary_button(image_actions, "GPUを確認", self._show_gpu_diagnostic).pack(side="left")
        self._label(image_actions, "画像プロンプトは完成記事を取り込んだ後に作成できます。", size=8, fg=MUTED, bg=SURFACE_2).pack(side="left", padx=(12,0))
        self._update_image_plan_controls()

'''

COLLECT_METHOD = r'''    def _collect_image_settings(self):
        def _value(name, default=""):
            var = self.vars.get(name)
            return var.get() if var is not None else default
        mode_map = {"Web版（おすすめ）":"web", "API版（準備中）":"api", "ローカルGPU（準備中）":"local"}
        style_map = {"おまかせ":"auto", "ビジネス":"business", "テック":"tech", "やさしい":"gentle", "図解風":"diagram", "アニメ風":"anime", "漫画風":"manga", "ポップ風":"pop", "高級感":"luxury", "サムネ映え重視":"catchy_thumbnail", "ナチュラル":"natural_blog", "ミニマル":"minimal", "インフォグラフィック":"infographic"}
        eyecatch = bool(_value("image_eyecatch_enabled", True))
        illustrations = bool(_value("image_illustrations_enabled", False))
        enabled = eyecatch or illustrations
        target = "both" if eyecatch and illustrations else ("eyecatch" if eyecatch else "illustrations")
        if not enabled:
            target = "both"
        legacy_enabled = self.vars.get("image_enabled")
        legacy_target = self.vars.get("image_target")
        if legacy_enabled is not None:
            legacy_enabled.set(enabled)
        if legacy_target is not None:
            legacy_target.set({"both":"アイキャッチ＋挿絵", "eyecatch":"アイキャッチのみ", "illustrations":"挿絵のみ"}[target])
        count = str(_value("image_count", "AIにおまかせ"))
        return {
            "enabled": enabled,
            "target": target,
            "mode": mode_map.get(_value("image_mode", "Web版（おすすめ）"), "web"),
            "style": style_map.get(_value("image_style", "おまかせ"), "auto"),
            "illustration_count": "auto" if count in {"自動", "AIにおまかせ"} else count,
            "insert_markers": illustrations,
            "text_mode": "none",
            "generate_alt_text": True,
            "generate_caption": False,
            "include_illustration_summary": True,
        }

    def _update_image_plan_controls(self):
        eyecatch_var = self.vars.get("image_eyecatch_enabled")
        illustrations_var = self.vars.get("image_illustrations_enabled")
        eyecatch = bool(eyecatch_var.get()) if eyecatch_var is not None else True
        illustrations = bool(illustrations_var.get()) if illustrations_var is not None else False
        if hasattr(self, "image_count_cb"):
            self.image_count_cb.configure(state="readonly" if illustrations else "disabled")
        if not hasattr(self, "image_plan_note"):
            return
        if eyecatch and illustrations:
            text = "作成予定：アイキャッチ＋挿絵｜完成記事プロンプトに挿絵マーカー指示を反映します。"
        elif eyecatch:
            text = "作成予定：アイキャッチのみ｜完成記事プロンプトには挿絵マーカーを入れません。"
        elif illustrations:
            text = "作成予定：挿絵のみ｜AIが必要枚数と差し込み位置を本文に記載します。"
        else:
            text = "作成予定：画像なし｜完成記事プロンプトに画像・挿絵の指示を入れません。"
        self.image_plan_note.configure(text=text)

'''

IMAGE_PROMPT_BUTTON = '        self._secondary_button(publish_links,"画像プロンプト",lambda:self._show_image_prompts((formatted_text.get("1.0","end").strip() or final_text.get("1.0","end").strip()))).pack(side="left",padx=4)\n'


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    new, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one block, got {count}")
    return new


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
        raise SystemExit("usage: patch_v0424.py <install-root> <package-root>")
    install = Path(sys.argv[1])
    package = Path(sys.argv[2])
    app = install / "src" / "ai_article_studio" / "ui" / "app.py"
    core_dst = install / "src" / "ai_article_studio" / "core"
    core_src = package / "payload" / "core"
    if not app.is_file():
        raise RuntimeError(f"required application file not found: {app}")
    if not core_dst.is_dir() or not core_src.is_dir():
        raise RuntimeError("v0.4.2.4 core directory missing")
    validate_payload(core_src)

    text = app.read_text(encoding="utf-8")
    if MARKER in text:
        print("v0.4.2.4 pre-article image planning controls already applied")
        return
    text = replace_regex_once(
        text,
        r"        self\.image_settings_card = self\.card\(body, bg=SURFACE_2\)\n.*?(?=        # Basic settings\n)",
        IMAGE_CARD,
        "image settings card",
    )
    text = replace_regex_once(
        text,
        r"    def _collect_image_settings\(self\):\n.*?(?=    def _sync_image_settings\(self\):)",
        COLLECT_METHOD,
        "image settings collector",
    )
    text = replace_regex_once(
        text,
        r"        # v0\.4\.2\.2 linked image controls\n        linked_image_card=tk\.Frame\(step4,.*?(?=        controls4=tk\.Frame\(step4,bg=SURFACE\); controls4\.pack\(fill=\"x\",padx=18,pady=\(0,14\)\)\n)",
        "",
        "post-article image settings panel",
    )
    text = replace_once(
        text,
        ARTICLE_PROMPT_ANCHOR,
        "            self._sync_image_settings()\n" + ARTICLE_PROMPT_ANCHOR,
        "article prompt image sync",
    )
    text = replace_once(text, BRAIN_ANCHOR, BRAIN_ANCHOR + IMAGE_PROMPT_BUTTON, "image prompt action")
    compile(text, str(app), "exec")

    app.write_text(text, encoding="utf-8", newline="\n")
    for name in CORE_FILES:
        shutil.copy2(core_src / name, core_dst / name)
    print(f"v{VERSION} pre-article image planning controls applied")


if __name__ == "__main__":
    main()
