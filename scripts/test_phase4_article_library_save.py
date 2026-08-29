from __future__ import annotations

from pathlib import Path
import tempfile

from ai_article_studio.core.db import ArticleDB
from ai_article_studio.ui.guided_wizard_v0432 import _save_completed_article


class Variable:
    def __init__(self, value):
        self.value = value

    def get(self):
        return self.value

    def set(self, value):
        self.value = value


class Bridge:
    def __init__(self):
        self.article_id = ""

    def current_snapshot(self):
        return {"article_id": self.article_id}


class App:
    def __init__(self, database):
        self.db = database
        self.web_ai_bridge = Bridge()
        self.current_record = None
        self.vars = {
            "platform": Variable("note"),
            "article_type": Variable("無料"),
            "genre": Variable("test"),
            "subgenre": Variable("test"),
        }


def main():
    with tempfile.TemporaryDirectory() as temp_name:
        app = App(ArticleDB(Path(temp_name) / "articles.db"))

        for index, expected in enumerate(("無料", "有料"), start=1):
            article_id = f"type-test-{index}"
            app.web_ai_bridge.article_id = article_id
            app.vars["article_type"].set(expected)

            saved = _save_completed_article(
                app,
                f"{expected}記事",
                "# 元記事",
                "# 掲載用記事",
            )

            assert saved["request"]["article_type"] == expected

            row = next(
                item
                for item in app.db.list_articles()
                if item["article_id"] == article_id
            )

            assert row["article_type"] == expected

            payload = app.db.load(article_id)
            assert payload["request"]["article_type"] == expected
            assert (
                payload["content"]["blocks"][0]["markdown"]
                == "# 掲載用記事"
            )

    print("PHASE4_ARTICLE_LIBRARY_SAVE: PASS")


if __name__ == "__main__":
    main()