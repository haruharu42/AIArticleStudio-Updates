AI Article Studio v0.4.3.3 - Phase Auth/UI Foundation
=====================================================

This update adds a common dark-navy login/registration UI, Supabase Email/Password and Google OAuth support, DPAPI-protected Windows session persistence, and role-separated User/Admin navigation.

It is cumulative and safely accepts canonical v0.4.2.9, v0.4.3.0, v0.4.3.1, or v0.4.3.2 installations. Required v0.4.3.2 article/publish modules are applied first inside the same verified update.

Security:
- The client accepts only the Supabase anon/publishable key. service_role is rejected.
- Passwords are never persisted.
- Admin navigation is based on an active profiles row returned through RLS.
- Existing articles, history, settings, Web AI state, image plans, updater files, and backups are preserved.

Before production use, apply the bundled Supabase migration and configure the values documented in AUTH_UI_FOUNDATION.md. If Auth is not configured, the existing local user mode remains available and never grants admin access.
