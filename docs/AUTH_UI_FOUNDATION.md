# Phase Auth/UI Foundation

The desktop client uses only the Supabase project URL and anon/publishable key. Never place a `service_role` key in the app, repository, installer, environment template, or local `config/auth.json`.

## Setup

1. Apply `supabase/migrations/202608230001_phase_auth_ui_foundation.sql` to the Supabase project.
2. Enable Email/Password and Google in Supabase Auth. Microsoft is intentionally unsupported.
3. Add `http://127.0.0.1:8765/auth/callback` to the Supabase Redirect URLs list and configure the Google provider.
4. Set the variables shown in `.env.example` for the desktop process, or create an untracked `config/auth.json` beside the installed application.
5. Publish the legal URLs before production registration is enabled.

Example local config (do not commit the populated file):

```json
{
  "supabase_url": "https://PROJECT.supabase.co",
  "anon_key": "PROJECT_ANON_OR_PUBLISHABLE_KEY",
  "redirect_url": "http://127.0.0.1:8765/auth/callback",
  "required": true,
  "terms_url": "https://example.com/terms",
  "privacy_url": "https://example.com/privacy",
  "ai_terms_url": "https://example.com/ai-terms"
}
```

On Windows, the saved access/refresh session is encrypted with the current user's DPAPI key. Passwords are never persisted. On unsupported operating systems the session remains non-persistent.

Admin navigation is shown only after the signed-in user's active `profiles` row is returned through RLS with `role = 'admin'`. The client contains no administrator override and no service key. Administrative mutations remain placeholders until a separately authenticated server-side API is available.
