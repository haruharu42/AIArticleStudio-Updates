from __future__ import annotations
import sqlite3, json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from .config import DB_PATH, ensure_dirs

SCHEMA = """
CREATE TABLE IF NOT EXISTS articles (
    article_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT '',
    platform TEXT NOT NULL DEFAULT '',
    genre TEXT NOT NULL DEFAULT '',
    article_type TEXT NOT NULL DEFAULT '',
    price_jpy INTEGER,
    actual_cost_jpy REAL NOT NULL DEFAULT 0,
    payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_updated ON articles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
"""

@contextmanager
def _connect(path):
    connection = sqlite3.connect(path)
    try:
        with connection:
            yield connection
    finally:
        connection.close()


class ArticleDB:
    def __init__(self, path: str | Path | None = None):
        if path is None:
            ensure_dirs()
            self.path = DB_PATH
        else:
            self.path = Path(path)
            self.path.parent.mkdir(parents=True, exist_ok=True)
        with _connect(self.path) as c:
            c.executescript(SCHEMA)

    def save(self, payload: dict) -> None:
        req = payload.get("request", {})
        now = datetime.now(timezone.utc).isoformat()
        payload["updated_at"] = now
        with _connect(self.path) as c:
            c.execute("""
            INSERT INTO articles(article_id,created_at,updated_at,status,title,theme,platform,genre,article_type,price_jpy,actual_cost_jpy,payload_json)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(article_id) DO UPDATE SET
                updated_at=excluded.updated_at,status=excluded.status,title=excluded.title,theme=excluded.theme,
                platform=excluded.platform,genre=excluded.genre,article_type=excluded.article_type,
                price_jpy=excluded.price_jpy,actual_cost_jpy=excluded.actual_cost_jpy,payload_json=excluded.payload_json
            """, (
                payload["article_id"], payload["created_at"], now, payload.get("status","draft"),
                payload.get("title",""), payload.get("theme",""), req.get("platform",""), req.get("genre",""),
                req.get("article_type",""), req.get("price_jpy"), float(payload.get("cost_actual",{}).get("total_jpy",0) or 0),
                json.dumps(payload, ensure_ascii=False)
            ))

    def list_articles(self, limit: int = 100) -> list[dict]:
        with _connect(self.path) as c:
            c.row_factory = sqlite3.Row
            rows = c.execute("SELECT * FROM articles ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def load(self, article_id: str) -> dict | None:
        with _connect(self.path) as c:
            row = c.execute("SELECT payload_json FROM articles WHERE article_id=?", (article_id,)).fetchone()
            return json.loads(row[0]) if row else None


    def delete(self, article_id: str) -> bool:
        with _connect(self.path) as c:
            cur = c.execute("DELETE FROM articles WHERE article_id=?", (article_id,))
            return cur.rowcount > 0

    def total_cost_this_month(self) -> float:
        prefix = datetime.now(timezone.utc).strftime("%Y-%m")
        with _connect(self.path) as c:
            row = c.execute("SELECT COALESCE(SUM(actual_cost_jpy),0) FROM articles WHERE updated_at LIKE ?", (prefix + "%",)).fetchone()
            return float(row[0] or 0)
