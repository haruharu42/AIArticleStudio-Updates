AI Article Studio v0.4.3.4 - Google OAuth PKCE hotfix
====================================================

This cumulative update removes the AAS-generated state parameter from the Supabase social authorize request and makes the local callback state check optional.

The PKCE verifier, challenge, s256 challenge method, loopback redirect URL, authorization-code callback, and grant_type=pkce exchange are preserved.

It safely accepts canonical v0.4.2.9 through v0.4.3.3 installations. Existing Email/Password Auth, DPAPI session persistence, profiles authorization, articles, history, settings, Web AI, image plans, updater files, and backups are preserved.
