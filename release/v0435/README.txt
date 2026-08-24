AI Article Studio v0.4.3.5 - Admin User Management
=================================================

This cumulative update activates Admin GUI user management for beta operations.

- Lists profiles without displaying email addresses.
- Shows pending, active, suspended, and disabled in Japanese.
- Supports pending to active approval, active to suspended, and suspended to active.
- Prevents the current administrator from suspending itself.
- Uses authenticated Supabase RPC calls; no service_role key is included.
- Adds a minimal non-client-readable audit table.

The update safely accepts canonical v0.4.2.9 through v0.4.3.4 installations and preserves articles, history, settings, Web AI, image plans, updater files, local mode, and backups.
