AI Article Studio v0.4.0 - Phase 3.5 Web AI Production

This update integrates the Phase 3.5 Web AI workflow into the desktop app.

Included:
- External Web AI model configuration with 24-hour cache and fallback
- Provider/platform/genre/free-paid prompt architecture
- Paid article value and bonus engine
- Web AI response ingest with raw/normalized separation
- Repair guidance and repair prompt copy flow
- Workflow state save/resume
- Publish-ready flow for note / Tips / Brain
- Integrated UI bridge and completion state

Safety:
- Preflight runs before modifying the app
- Update aborts if the installed UI cannot be identified safely
- Python compile and feature validation run after patching
- The updater's existing backup/rollback layer remains responsible for rollback on failure

API is not required for the Web AI workflow.
