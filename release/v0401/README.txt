AI Article Studio v0.4.0.1 - v0.3.9 Upgrade Bridge

Purpose:
- Safely upgrade an installed v0.3.9 environment to the Phase 3.5 integrated core/UI state required before v0.4.1.

Why this bridge exists:
- The original v0.4.0 preflight recursively scanned the whole AIArticleStudio folder.
- The updater creates backup_auto_* folders before applying an update.
- Those backups contain ui/app.py and were incorrectly counted as extra live UI candidates, causing multiple_ui_candidates and blocking v0.4.0.

Fix:
- Inspect only the canonical live file src/ai_article_studio/ui/app.py.
- Ignore backup_auto_* and other backup folders completely.
- Require installed version v0.3.9 before applying the bridge.
- Run Phase 3.5 patch, compile validation, and feature validation before reporting success.

After this update:
- Confirm Installed version : v0.4.0.1
- Then update once more to v0.4.1.

Build revision: 2
