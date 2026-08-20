AI Article Studio v0.4.2.8
================================

This corrective update directly activates the approved six-step visual Article Creator.

- Replaces the active article-creation call site instead of only replacing a method implementation.
- Replaces the active embedded Web AI call site in the same way.
- Hides the old five-tab navigation and long-form scrollbar before rendering the new wizard.
- Keeps the approved v0.4.2.7 visual design, image plan, recent history, paste clearing, decorated preview, and inline image prompts.
- Corrects a Tk grid configuration that could stop the new UI during runtime initialization.
- Adds a real Tkinter runtime test on Windows, verifying that legacy cards are hidden and the six-step visual UI is active.

The updater accepts only canonical v0.4.2.7 and validates that no legacy call site remains after installation.
