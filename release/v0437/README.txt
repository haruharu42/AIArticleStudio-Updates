AI Article Studio v0.4.3.7 - Admin UI Payload Repair
====================================================

This focused repair reapplies the verified v0.4.3.6 Admin UI payload when a
Windows installation already reports v0.4.3.6 but still contains an older
auth_ui.py.

- Forces the installed auth_ui.py to match the verified package payload.
- Restores visible Approve, Suspend, and Reactivate buttons.
- Restores Admin/User display-mode switching for active administrators.
- Prints the installed auth_ui.py SHA256 before and after replacement.
- Does not change Supabase, authentication, roles, statuses, articles, history,
  settings, Web AI, image plans, updater configuration, or local data.

This cumulative repair accepts canonical v0.4.3.4, v0.4.3.5, and v0.4.3.6
installations. Restart AI Article Studio after the update completes.
