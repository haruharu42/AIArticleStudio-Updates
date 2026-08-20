AI Article Studio v0.4.2.9
================================

This corrective update activates the approved UI from the real Article Creator navigation event.

- Wraps the live show_create event instead of relying on an end-of-builder call site.
- Detects the actual long-form Article Creator body after its widgets have been rendered.
- Replaces that live body with the approved one-item-at-a-time six-step visual wizard.
- Hides the old five-tab navigation, long vertical scrollbar, and stacked legacy cards.
- Keeps image planning, recent history, paste clearing, decorated final article preview, and inline image prompts.
- Forces Python bytecode recompilation after installation.
- Adds a Windows Tk test that clicks the real show_create path and waits for the UI replacement.

The updater accepts only canonical v0.4.2.8 and validates the live event hook after installation.
