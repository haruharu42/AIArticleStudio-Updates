from __future__ import annotations
from pathlib import Path
import tempfile
import unittest
from datetime import datetime, timezone
from test_phase5c_cloud_asset_sync import FakeAssetCloud, actor, add_cover
from ai_article_studio.core.cloud_assets import CloudAssetSyncCoordinator
from ai_article_studio.core.cloud_articles import CloudArticleError
from ai_article_studio.core.image_assets import ArticleImageStore


class MetadataCloud(FakeAssetCloud):
    def __init__(self):
        super().__init__()
        self.offline = False
        self.after_save = None

    def finalize(self, actor_value, asset_id, checksum):
        row = super().finalize(actor_value, asset_id, checksum)
        self.rows[asset_id].update(updated_at=datetime.now(timezone.utc).isoformat(), user_id=actor_value.profile.id)
        return dict(self.rows[asset_id])

    def article_revision(self, _actor, _article):
        self.events.append("article_revision")
        return 2

    def begin_delete_versioned(self, actor_value, asset, *, expected_revision=None):
        if expected_revision is not None and expected_revision != self.article_revision(actor_value, asset["article_id"]):
            raise CloudArticleError("stale article",category="revision_conflict",code="40001")
        if self.rows[asset["id"]].get("updated_at") != asset.get("updated_at"):
            raise CloudArticleError("stale image",category="revision_conflict",code="40001")
        return self.begin_delete(actor_value, asset["id"])

    def update_metadata(self, actor_value, article_id, asset):
        self.events.append('metadata')
        if self.offline:
            raise CloudArticleError('offline',category='network_unavailable',code='offline')
        row = self.rows.get(asset['cloud_asset_id'])
        if row is None:
            raise CloudArticleError('missing',category='not_found',code='P0002')
        if row['updated_at'] != asset['cloud_updated_at']:
            raise CloudArticleError('stale',category='revision_conflict',code='40001')
        row.update(sort_order=asset['sort_order'],insertion_marker=asset['insertion_marker'],alt_text=asset['alt_text'],updated_at=datetime.now(timezone.utc).isoformat())
        if self.after_save:
            self.after_save()
        return dict(row)


class MetadataTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.root=Path(self.tmp.name)
        self.store=ArticleImageStore(self.root/'images')
        self.cloud=MetadataCloud()
        self.sync=CloudAssetSyncCoordinator(self.store,self.cloud,actor())
        self.article='10000000-0000-4000-8000-000000000001'
        self.local='phase8-test'
        self.local_asset=add_cover(self.store,self.root,self.local)['local_asset_id']
        self.sync.sync_local(self.local,self.article)
        self.asset_id=self.record()['cloud_asset_id']

    def tearDown(self): self.tmp.cleanup()
    def record(self): return self.store.list_managed_assets(self.local,include_deleted=True)[0]
    def edit(self,alt='local draft',order=2):
        return self.store.edit_metadata(self.local,self.local_asset,sort_order=order,insertion_marker=None,alt_text=alt)

    def test_pwa_metadata_reaches_existing_windows_asset_without_file_or_plan_loss(self):
        path=self.store.managed_file_path(self.local,self.record()); original=path.read_bytes()
        payload=self.store.load_payload(self.local);payload['future']={'keep':True};payload['image_settings']={'enabled':True};self.store.save_payload(self.local,payload)
        self.cloud.rows[self.asset_id].update(alt_text='PWA alt',sort_order=7,updated_at='2026-09-08T20:00:00.123456+00:00')
        self.sync.refresh_remote(self.local,self.article)
        self.assertEqual(self.record()['alt_text'],'PWA alt'); self.assertEqual(self.record()['sort_order'],7)
        self.assertEqual(path.read_bytes(),original);self.assertEqual(self.store.load_payload(self.local)['future'],{'keep':True})
        self.assertEqual(self.store.load_payload(self.local)['image_settings'],{'enabled':True})

    def test_windows_metadata_push_does_not_reupload_image(self):
        original=dict(self.cloud.objects); before=self.cloud.events.count('upload')
        self.edit('Windows alt',9);self.sync.sync_local(self.local,self.article)
        self.assertEqual(self.cloud.rows[self.asset_id]['alt_text'],'Windows alt')
        self.assertEqual(self.cloud.rows[self.asset_id]['sort_order'],9)
        self.assertFalse(self.record()['metadata_dirty'])
        self.assertEqual(self.cloud.objects,original); self.assertEqual(self.cloud.events.count('upload'),before)

    def test_offline_draft_survives_and_can_be_retried(self):
        self.edit();self.cloud.offline=True
        with self.assertRaises(CloudArticleError):self.sync.sync_local(self.local,self.article)
        reopened=ArticleImageStore(self.root/'images').list_managed_assets(self.local)[0]
        self.assertEqual(reopened['alt_text'],'local draft');self.assertTrue(reopened['metadata_dirty'])
        self.cloud.offline=False;self.sync.sync_local(self.local,self.article)
        self.assertFalse(self.record()['metadata_dirty'])

    def test_conflict_keeps_local_draft_and_exposes_latest_metadata(self):
        self.edit();self.cloud.rows[self.asset_id].update(alt_text='remote changed',updated_at='2026-09-08T22:00:00.987654+00:00')
        with self.assertRaises(CloudArticleError) as caught:self.sync.sync_local(self.local,self.article)
        self.assertEqual(caught.exception.code,'40001')
        self.sync.refresh_remote(self.local,self.article)
        self.assertEqual(self.record()['alt_text'],'local draft')
        self.assertEqual(self.record()['remote_metadata_snapshot']['alt_text'],'remote changed')
        self.assertTrue(self.record()['metadata_dirty'])

    def test_new_local_edit_during_save_is_preserved(self):
        self.edit('first draft')
        self.cloud.after_save=lambda:self.edit('newer draft')
        self.sync.sync_local(self.local,self.article)
        self.assertEqual(self.cloud.rows[self.asset_id]['alt_text'],'first draft')
        self.assertEqual(self.record()['alt_text'],'newer draft');self.assertTrue(self.record()['metadata_dirty'])
        self.cloud.after_save=None;self.sync.sync_local(self.local,self.article)
        self.assertEqual(self.cloud.rows[self.asset_id]['alt_text'],'newer draft')

    def test_edit_during_initial_prepare_survives_first_upload(self):
        second = "second-local"
        local_asset = add_cover(self.store, self.root, second)['local_asset_id']
        original_prepare = self.cloud.prepare
        def prepare_and_edit(actor_value, cloud_id, asset):
            result = original_prepare(actor_value, cloud_id, asset)
            self.store.edit_metadata(second, local_asset, sort_order=8,
                                     insertion_marker=None, alt_text='edited during prepare')
            return result
        self.cloud.prepare = prepare_and_edit
        self.sync.sync_local(second, self.article)
        record = self.store.list_managed_assets(second)[0]
        self.assertEqual(record['alt_text'], 'edited during prepare')
        self.assertTrue(record['metadata_dirty'])
        self.cloud.prepare = original_prepare
        self.sync.sync_local(second, self.article)
        self.assertEqual(self.cloud.rows[record['cloud_asset_id']]['alt_text'], 'edited during prepare')
        self.assertFalse(self.store.list_managed_assets(second)[0]['metadata_dirty'])

    def test_initial_upload_failure_keeps_new_metadata_for_retry(self):
        second = "retry-local"
        local_asset = add_cover(self.store, self.root, second)['local_asset_id']
        original_prepare = self.cloud.prepare
        def prepare_and_edit(actor_value, cloud_id, asset):
            result = original_prepare(actor_value, cloud_id, asset)
            self.store.edit_metadata(second, local_asset, sort_order=8,
                                     insertion_marker=None, alt_text='retained after failure')
            return result
        self.cloud.prepare = prepare_and_edit
        self.cloud.fail_upload = True
        with self.assertRaises(CloudArticleError): self.sync.sync_local(second, self.article)
        self.cloud.prepare = original_prepare
        self.cloud.fail_upload = False
        self.sync.sync_local(second, self.article)
        record = self.store.list_managed_assets(second)[0]
        self.assertTrue(record['metadata_dirty'])
        self.sync.sync_local(second, self.article)
        record = self.store.list_managed_assets(second)[0]
        self.assertEqual(self.cloud.rows[record['cloud_asset_id']]['alt_text'], 'retained after failure')
        self.assertFalse(record['metadata_dirty'])

    def test_remote_deletion_keeps_unsaved_metadata_and_local_bytes(self):
        self.edit(); path=self.store.managed_file_path(self.local,self.record());original=path.read_bytes()
        del self.cloud.rows[self.asset_id];self.sync.refresh_remote(self.local,self.article)
        self.assertTrue(self.record()['metadata_dirty']);self.assertEqual(self.record()['alt_text'],'local draft')
        self.assertEqual(path.read_bytes(),original)

    def test_windows_stale_article_delete_stops_before_images(self):
        from ai_article_studio.core.cloud_article_sync import CloudArticleSyncCoordinator
        from ai_article_studio.core.db import ArticleDB
        from test_phase5b_cloud_article_sync import FakeCloud, record
        database=ArticleDB(self.root/'articles.db')
        database.save(record(self.local))
        cloud=FakeCloud()
        coordinator=CloudArticleSyncCoordinator(database,cloud,actor(),asset_coordinator=self.sync,image_store=self.store)
        coordinator.push_local(self.local)
        before=list(self.cloud.events)
        with self.assertRaises(CloudArticleError) as caught: coordinator.delete_local(self.local)
        self.assertEqual(caught.exception.code,'40001')
        self.assertEqual(self.cloud.events[len(before):],['article_revision'])
        self.assertTrue(database.load(self.local))
        self.assertTrue(self.cloud.objects)

    def test_article_revision_is_bound_through_image_deletion(self):
        before = dict(self.cloud.objects)
        with self.assertRaises(CloudArticleError) as caught:
            self.sync.delete_all_for_article(self.local, self.article, expected_revision=1)
        self.assertEqual(caught.exception.code, '40001')
        self.assertEqual(before, self.cloud.objects)
        self.assertEqual(self.cloud.rows[self.asset_id]['status'], 'ready')

    def test_windows_stale_image_delete_keeps_remote_object_and_local_file(self):
        path=self.store.managed_file_path(self.local,self.record());original=path.read_bytes()
        self.cloud.rows[self.asset_id].update(alt_text='remote edit',updated_at='2026-09-09T01:00:00+00:00')
        self.store.mark_delete(self.local,self.local_asset)
        with self.assertRaises(CloudArticleError) as caught:self.sync.sync_local(self.local,self.article)
        self.assertEqual(caught.exception.code,'40001');self.assertTrue(self.cloud.objects)
        self.assertEqual(path.read_bytes(),original)

    def test_invalid_metadata_does_not_overwrite_sidecar(self):
        before=self.store.metadata_path(self.local).read_bytes()
        for order,marker,alt in [(-1,None,'x'),(0,'cover-marker','x'),(0,None,'x'*2001)]:
            with self.assertRaises(ValueError):self.store.edit_metadata(self.local,self.local_asset,sort_order=order,insertion_marker=marker,alt_text=alt)
        self.assertEqual(self.store.metadata_path(self.local).read_bytes(),before)


if __name__=='__main__': unittest.main(verbosity=2)
