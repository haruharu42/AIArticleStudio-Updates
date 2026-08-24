AI Article Studio v0.4.3.6 - Admin User Mode
============================================

This focused update fixes Windows Tk clipping of Admin user-management action buttons.

- Keeps Approve, Suspend, and Reactivate buttons inside the visible table width.
- Adds Admin GUI to User GUI display-mode switching for active administrators.
- Reuses the existing User GUI and shared article Core without copying features.
- Never changes profiles.role or profiles.status when switching display modes.
- Keeps Admin navigation and management actions unavailable in User mode.

This cumulative update accepts canonical v0.4.3.4 and v0.4.3.5 installations and preserves authentication,
articles, history, settings, Web AI, image plans, updater data, and Supabase schema.
