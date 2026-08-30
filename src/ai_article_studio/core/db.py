from __future__ import annotations
import sqlite3, json
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID
from .config import DB_PATH, ensure_dirs

SYNC_STATUSES = {
    "local_only",
    "pending_create",
    "pending_update",
    "synced",
    "conflict",
    "error",
}

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
CREATE TABLE IF NOT EXISTS article_cloud_sync (
    local_article_id TEXT PRIMARY KEY,
    cloud_article_id TEXT UNIQUE,
    cloud_revision INTEGER,
    sync_status TEXT NOT NULL DEFAULT 'local_only'
        CHECK (sync_status IN (
            'local_only',
            'pending_create',
            'pending_update',
            'synced',
            'conflict',
            'error'
        )),
    last_synced_at TEXT,
    last_sync_error TEXT,
    last_synced_hash TEXT,
    FOREIGN KEY (local_article_id)
        REFERENCES articles(article_id)
        ON DELETE CASCADE,
    CHECK (cloud_revision IS NULL OR cloud_revision >= 1)
);
CREATE INDEX IF NOT EXISTS idx_article_cloud_sync_status
    ON article_cloud_sync(sync_status, local_article_id);
INSERT OR IGNORE INTO article_cloud_sync(local_article_id, sync_status)
SELECT article_id, 'local_only'
FROM articles;
"""

@contextmanager
def _connect(path):
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA foreign_keys = ON")
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
            c.execute(
                """
                INSERT OR IGNORE INTO article_cloud_sync(
                    local_article_id,
                    sync_status
                ) VALUES (?, 'local_only')
                """,
                (payload["article_id"],),
            )
            # A mapped article saved by the Windows editor is no longer known
            # to match the cloud revision.  Mark it for an explicit update;
            # the sync coordinator performs the authenticated RPC afterwards.
            # Cloud pull writes use the underlying DB and immediately restore
            # the authoritative synced mapping, so they cannot loop back into
            # another upload.
            c.execute(
                """
                UPDATE article_cloud_sync
                SET sync_status = 'pending_update', last_sync_error = NULL
                WHERE local_article_id = ?
                  AND cloud_article_id IS NOT NULL
                  AND sync_status = 'synced'
                """,
                (payload["article_id"],),
            )

    def list_articles(self, limit: int = 100) -> list[dict]:
        with _connect(self.path) as c:
            c.row_factory = sqlite3.Row
            rows = c.execute("SELECT * FROM articles ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def load(self, article_id: str) -> dict | None:
        with _connect(self.path) as c:
            row = c.execute("SELECT payload_json FROM articles WHERE article_id=?", (article_id,)).fetchone()
            return json.loads(row[0]) if row else None

    def get_cloud_sync(self, local_article_id: str) -> dict | None:
        with _connect(self.path) as c:
            c.row_factory = sqlite3.Row
            row = c.execute(
                """
                SELECT
                    local_article_id,
                    cloud_article_id,
                    cloud_revision,
                    sync_status,
                    last_synced_at,
                    last_sync_error,
                    last_synced_hash
                FROM article_cloud_sync
                WHERE local_article_id = ?
                """,
                (str(local_article_id),),
            ).fetchone()
            return dict(row) if row else None

    def get_cloud_sync_by_cloud_id(self, cloud_article_id: str) -> dict | None:
        cloud_value = str(cloud_article_id or "").strip()
        try:
            cloud_value = str(UUID(cloud_value))
        except (ValueError, AttributeError, TypeError):
            return None
        with _connect(self.path) as c:
            c.row_factory = sqlite3.Row
            row = c.execute(
                """
                SELECT
                    local_article_id,
                    cloud_article_id,
                    cloud_revision,
                    sync_status,
                    last_synced_at,
                    last_sync_error,
                    last_synced_hash
                FROM article_cloud_sync
                WHERE cloud_article_id = ?
                """,
                (cloud_value,),
            ).fetchone()
            return dict(row) if row else None

    def list_cloud_sync(self) -> list[dict]:
        with _connect(self.path) as c:
            c.row_factory = sqlite3.Row
            rows = c.execute(
                """
                SELECT
                    local_article_id,
                    cloud_article_id,
                    cloud_revision,
                    sync_status,
                    last_synced_at,
                    last_sync_error,
                    last_synced_hash
                FROM article_cloud_sync
                ORDER BY local_article_id
                """
            ).fetchall()
            return [dict(row) for row in rows]

    def set_cloud_mapping(
        self,
        local_article_id: str,
        cloud_article_id: str,
        cloud_revision: int,
        *,
        sync_status: str = "synced",
        last_synced_hash: str | None = None,
    ) -> dict:
        local_value = str(local_article_id or "").strip()
        cloud_value = str(cloud_article_id or "").strip()
        if not local_value:
            raise ValueError("local_article_id is required")
        try:
            cloud_value = str(UUID(cloud_value))
        except (ValueError, AttributeError, TypeError) as exc:
            raise ValueError("cloud_article_id must be a UUID") from exc
        revision_value = int(cloud_revision)
        if revision_value < 1:
            raise ValueError("cloud_revision must be at least 1")
        self._validate_sync_status(sync_status)
        now = datetime.now(timezone.utc).isoformat()
        try:
            with _connect(self.path) as c:
                if c.execute(
                    "SELECT 1 FROM articles WHERE article_id = ?",
                    (local_value,),
                ).fetchone() is None:
                    raise KeyError(local_value)
                c.execute(
                    """
                    INSERT INTO article_cloud_sync(
                        local_article_id,
                        cloud_article_id,
                        cloud_revision,
                        sync_status,
                        last_synced_at,
                        last_sync_error,
                        last_synced_hash
                    ) VALUES (?, ?, ?, ?, ?, NULL, ?)
                    ON CONFLICT(local_article_id) DO UPDATE SET
                        cloud_article_id = excluded.cloud_article_id,
                        cloud_revision = excluded.cloud_revision,
                        sync_status = excluded.sync_status,
                        last_synced_at = excluded.last_synced_at,
                        last_sync_error = NULL,
                        last_synced_hash = excluded.last_synced_hash
                    """,
                    (
                        local_value,
                        cloud_value,
                        revision_value,
                        sync_status,
                        now,
                        last_synced_hash,
                    ),
                )
        except sqlite3.IntegrityError as exc:
            raise ValueError("cloud_article_id is already mapped") from exc
        return self.get_cloud_sync(local_value) or {}

    def update_sync_status(
        self,
        local_article_id: str,
        sync_status: str,
        *,
        error: str | None = None,
    ) -> dict:
        self._validate_sync_status(sync_status)
        local_value = str(local_article_id or "").strip()
        with _connect(self.path) as c:
            cursor = c.execute(
                """
                UPDATE article_cloud_sync
                SET sync_status = ?, last_sync_error = ?
                WHERE local_article_id = ?
                """,
                (sync_status, None if error is None else str(error), local_value),
            )
            if cursor.rowcount != 1:
                raise KeyError(local_value)
        return self.get_cloud_sync(local_value) or {}

    @staticmethod
    def _validate_sync_status(sync_status: str) -> None:
        if sync_status not in SYNC_STATUSES:
            raise ValueError(f"unsupported sync status: {sync_status}")


    def delete(self, article_id: str) -> bool:
        with _connect(self.path) as c:
            cur = c.execute("DELETE FROM articles WHERE article_id=?", (article_id,))
            return cur.rowcount > 0

    def total_cost_this_month(self) -> float:
        prefix = datetime.now(timezone.utc).strftime("%Y-%m")
        with _connect(self.path) as c:
            row = c.execute("SELECT COALESCE(SUM(actual_cost_jpy),0) FROM articles WHERE updated_at LIKE ?", (prefix + "%",)).fetchone()
            return float(row[0] or 0)
