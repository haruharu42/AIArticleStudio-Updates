AI Article Studio v0.4.3.0
================================

This update fixes the transition from STEP 4 article design to STEP 5 creation.

- The purple "作成へ" button now invokes the original hidden creation action that already prepares and validates the article request.
- Web AI falls back to the direct method only when the original action button cannot be found.
- Adds an "AIおまかせ" checkbox beside the article theme field.
- When enabled, the theme is safely stored as "AIおまかせ" and the AI selects the topic direction from the other article settings.
- Preserves manual themes when switching AI-auto off and on.
- Safely removes only stale Python cache directories/files before rebuilding bytecode.
- Never deletes article data, settings, history, or updater backups.

The updater accepts only canonical v0.4.2.9 and validates all required UI modules after installation.
