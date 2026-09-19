create index if not exists app_releases_created_by_idx
  on public.app_releases(created_by);
create index if not exists app_release_channels_current_release_idx
  on public.app_release_channels(current_release_id);
create index if not exists app_release_channels_candidate_release_idx
  on public.app_release_channels(candidate_release_id);
create index if not exists app_release_channels_updated_by_idx
  on public.app_release_channels(updated_by);
create index if not exists user_release_state_last_notified_idx
  on public.user_release_state(last_notified_release_id);
create index if not exists app_release_audit_actor_idx
  on public.app_release_audit(actor_user_id);
create index if not exists app_release_audit_release_idx
  on public.app_release_audit(release_id);
create index if not exists app_release_audit_target_release_idx
  on public.app_release_audit(target_release_id);
