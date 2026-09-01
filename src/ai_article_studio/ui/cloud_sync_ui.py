from __future__ import annotations

import threading
from typing import Any, Callable, Mapping
from tkinter import messagebox

from ..core.cloud_article_sync import CloudArticleSyncCoordinator, CloudSyncResult
from ..core.cloud_articles import CloudArticleError
from ..core.cloud_assets import CloudAssetSyncCoordinator, CloudAssetSyncResult
from ..core.db import ArticleDB


SYNCABLE_STATUSES = {
    "完成",
    "ready",
    "公開待ち",
    "waiting_publish",
    "公開済み",
    "published",
}


class CloudArticleUIBridge:
    """Small async boundary between Tk and the cloud sync coordinator."""

    def __init__(
        self,
        app,
        coordinator: CloudArticleSyncCoordinator,
        *,
        asset_coordinator: CloudAssetSyncCoordinator | None = None,
    ):
        self.app = app
        self.coordinator = coordinator
        self.asset_coordinator = asset_coordinator
        self._lock = threading.Lock()
        self._push_inflight: set[str] = set()
        self._push_queued: set[str] = set()
        self._pull_inflight = False
        self._asset_inflight: set[str] = set()
        self._asset_queued: set[str] = set()
        self._closed = False

    def close(self) -> None:
        with self._lock:
            self._closed = True
            self._push_queued.clear()
            self._asset_queued.clear()

    def schedule_push(self, payload: Mapping[str, Any]) -> None:
        local_id = str(payload.get("article_id") or "").strip()
        status = str(payload.get("status") or "").strip()
        if not local_id or status not in SYNCABLE_STATUSES:
            return
        with self._lock:
            if self._closed:
                return
            if local_id in self._push_inflight:
                self._push_queued.add(local_id)
                return
            self._push_inflight.add(local_id)
        threading.Thread(
            target=self._push_worker,
            args=(local_id,),
            daemon=True,
        ).start()

    def refresh_library(
        self,
        on_changed: Callable[[CloudSyncResult], None] | None = None,
    ) -> None:
        with self._lock:
            if self._closed or self._pull_inflight:
                return
            self._pull_inflight = True

        def worker() -> None:
            result = None
            caught: Exception | None = None
            try:
                result = self.coordinator.pull_cloud()
            except Exception as exc:
                caught = exc
            with self._lock:
                self._pull_inflight = False
                closed = self._closed
            if closed:
                return
            self._after(lambda: self._finish_pull(result, caught, on_changed))

        threading.Thread(target=worker, daemon=True).start()

    def schedule_asset_sync(self, local_article_id: str) -> None:
        """Run one foreground-requested image sync attempt; never auto-retry."""

        local_id = str(local_article_id or "").strip()
        mapping = self.coordinator.database.get_cloud_sync(local_id) or {}
        cloud_id = str(mapping.get("cloud_article_id") or "").strip()
        if not local_id or not cloud_id or self.asset_coordinator is None:
            self._set_status({"status": "local_only", "local_article_id": local_id, "images": "local_only"})
            return
        with self._lock:
            if self._closed:
                return
            if local_id in self._asset_inflight:
                self._asset_queued.add(local_id)
                return
            self._asset_inflight.add(local_id)

        def worker() -> None:
            while True:
                result = None
                caught: Exception | None = None
                try:
                    result = self.asset_coordinator.sync_local(local_id, cloud_id)
                except Exception as exc:
                    caught = exc
                with self._lock:
                    rerun = caught is None and local_id in self._asset_queued
                    self._asset_queued.discard(local_id)
                    if not rerun:
                        self._asset_inflight.discard(local_id)
                    closed = self._closed
                if closed:
                    return
                self._after(lambda value=result, error=caught: self._finish_asset_sync(value, error))
                if not rerun:
                    return

        threading.Thread(target=worker, daemon=True).start()

    def signed_asset_url(self, asset: Mapping[str, Any], *, expires_in: int = 60) -> str:
        if self.asset_coordinator is None:
            raise CloudArticleError("クラウド画像同期が利用できません。", category="configuration", code="image_sync_unavailable")
        return self.asset_coordinator.signed_url(asset, expires_in=expires_in)

    def delete(self, local_article_id: str) -> bool:
        try:
            return self.coordinator.delete_local(local_article_id)
        except CloudArticleError as exc:
            self._record_error(exc)
            messagebox.showwarning(
                "クラウド記事",
                self._delete_error_message(exc),
            )
            return False
        except Exception as exc:
            self._record_unexpected(exc)
            messagebox.showwarning(
                "クラウド記事",
                "クラウド側の削除を確認できなかったため、ローカル記事は削除していません。",
            )
            return False

    def _push_worker(self, local_id: str) -> None:
        while True:
            result = None
            caught: Exception | None = None
            try:
                result = self.coordinator.push_local(local_id)
            except Exception as exc:
                caught = exc

            with self._lock:
                rerun = caught is None and local_id in self._push_queued
                self._push_queued.discard(local_id)
                closed = self._closed
                if not rerun:
                    self._push_inflight.discard(local_id)
            if closed:
                return
            self._after(lambda value=result, error=caught: self._finish_push(value, error))
            if not rerun:
                return

    def _finish_push(
        self,
        result: CloudSyncResult | None,
        exc: Exception | None,
    ) -> None:
        if exc is None and result is not None:
            self._set_status({
                "status": "synced",
                "action": result.action,
                "local_article_id": result.local_article_id,
                "cloud_revision": result.cloud_revision,
                "image_uploaded": result.image_uploaded,
                "image_deleted": result.image_deleted,
                "image_pending": result.image_pending,
            })
            return
        if isinstance(exc, CloudArticleError):
            self._record_error(exc)
            if exc.category == "entitlement_denied":
                return
            if exc.category == "revision_conflict":
                messagebox.showwarning(
                    "クラウド同期の競合",
                    "ローカル記事は保存されていますが、クラウド版が更新されています。記事ライブラリを更新してから再編集してください。",
                )
                return
            messagebox.showwarning(
                "クラウド同期",
                "記事はローカルへ安全に保存しましたが、クラウド同期は保留になりました。接続を確認して記事ライブラリを開き直してください。",
            )
            return
        if exc is not None:
            self._record_unexpected(exc)
            messagebox.showwarning(
                "クラウド同期",
                "記事はローカルへ安全に保存しましたが、クラウド同期を完了できませんでした。",
            )

    def _finish_asset_sync(
        self,
        result: CloudAssetSyncResult | None,
        exc: Exception | None,
    ) -> None:
        if exc is None and result is not None:
            self._set_status({
                "status": "synced" if not result.pending else "pending",
                "local_article_id": result.local_article_id,
                "image_uploaded": result.uploaded,
                "image_deleted": result.deleted,
                "image_pending": result.pending,
            })
            callback = getattr(self.app, "_aas_image_sync_changed", None)
            if callable(callback):
                try:
                    callback(result.local_article_id)
                except Exception:
                    pass
            return
        if isinstance(exc, CloudArticleError):
            self._record_error(exc)
            if exc.category == "entitlement_denied":
                return
        elif exc is not None:
            self._record_unexpected(exc)
        messagebox.showwarning(
            "クラウド画像同期",
            "画像はローカルへ安全に保存されていますが、クラウド同期は完了していません。再試行ボタンで明示的に再実行できます。",
        )

    def _finish_pull(
        self,
        result: CloudSyncResult | None,
        exc: Exception | None,
        on_changed: Callable[[CloudSyncResult], None] | None,
    ) -> None:
        if exc is None and result is not None:
            self._set_status({
                "status": "synced",
                "action": result.action,
                "imported": result.imported,
                "updated": result.updated,
                "skipped": result.skipped,
            })
            if on_changed is not None and (result.imported or result.updated):
                on_changed(result)
            return
        if isinstance(exc, CloudArticleError):
            self._record_error(exc)
            if exc.category in {"entitlement_denied", "network_unavailable", "timeout"}:
                return
        elif exc is not None:
            self._record_unexpected(exc)

    def _record_error(self, exc: CloudArticleError) -> None:
        self._set_status({
            "status": "error",
            "category": exc.category,
            "code": exc.code,
        })

    def _record_unexpected(self, exc: Exception) -> None:
        self._set_status({
            "status": "error",
            "category": "local_sync_error",
            "code": type(exc).__name__,
        })

    def _set_status(self, value: dict[str, Any]) -> None:
        self.app._aas_cloud_sync_status = value
        callback = getattr(self.app, "_aas_cloud_sync_status_changed", None)
        if callable(callback):
            try:
                callback(value)
            except Exception:
                pass

    def _after(self, callback: Callable[[], None]) -> None:
        try:
            self.app.after(0, callback)
        except Exception:
            return

    @staticmethod
    def _delete_error_message(exc: CloudArticleError) -> str:
        if exc.category == "asset_dependency" or "article_has_assets" in str(exc):
            return "クラウド画像を先に削除できなかったため、記事とローカル画像は削除していません。接続を確認して再試行してください。"
        if exc.category == "revision_conflict":
            return "クラウド版が更新されています。記事ライブラリを更新してから削除してください。"
        return "クラウド側の削除を確認できなかったため、ローカル記事は削除していません。"


class CloudAwareArticleDB:
    """Delegate local DB operations and attach safe cloud UI actions."""

    def __init__(self, local: ArticleDB, bridge: CloudArticleUIBridge):
        self.local = local
        self.bridge = bridge

    def save(self, payload: dict) -> None:
        self.local.save(payload)
        self.bridge.schedule_push(payload)

    def delete(self, article_id: str) -> bool:
        return self.bridge.delete(article_id)

    def __getattr__(self, name: str):
        return getattr(self.local, name)
