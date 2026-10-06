# Shared Development login/logout (no Docker)

Use only TaxTrax DEVELOPMENT (`dbcakdqthnamgjfkkxzn`). Production is not a test
target. Existing authentication, profile RLS and provider-session checks are
unchanged. SQLite remains local for unrelated website/admin features. Password
recovery, MFA, Remember me and other portal functions remain deferred; this is
not a production deployment or compliance certification.

## Ahmed: Windows PowerShell

Use the existing Node **20.18.0** runtime (not Node 22/26). From the repository root:

```powershell
git checkout dev
git pull
cd website
npm ci
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
notepad .env.local
npm run dev
```

In `.env.local`, set these exact names:

```dotenv
SUPABASE_URL=https://dbcakdqthnamgjfkkxzn.supabase.co
SUPABASE_PUBLISHABLE_KEY=<Dev sb_publishable_ key>
AUTH_ORIGIN=http://localhost:3000
```

Obtain the project URL and publishable key from Helio privately, or from the
**Development** project's Supabase Connect dialog / Settings > API Keys.
Never select Production, a legacy anon key, a secret/service-role key, a database
password or a management access token. The URL/key are unprivileged and browser-safe,
but this implementation reads them server-side: no `NEXT_PUBLIC_SUPABASE_*`
variables or browser Supabase client are needed. `AUTH_ORIGIN` is public configuration.
Preserve unrelated existing environment values. The desktop's `ADMIN_API_KEY` is
unrelated to Client Portal login; keep it private if using the admin app.

Open **http://localhost:3000/portal** (use localhost consistently). Obtain the
synthetic shared-Dev email/password from Helio through a password manager/private
channel. Do not use the documented Docker-local fixture password: the shared
account has a separately generated random password, not committed to Git.

Expected: anonymous visits show login, correct credentials display **Synthetic
Shared Dev Client**, refreshing preserves server-authorized access, and either
desktop/mobile logout returns to login. Wrong credentials give generic feedback.
If port 3000 is occupied, stop your own earlier dev server deliberately; do not
silently use another port without updating `AUTH_ORIGIN`. Restart after changing
environment values. Other dashboard data/controls remain mock content.

No Docker, Supabase CLI login/link, migration push or admin key is required for
Ahmed's portal test. Internet access to the shared Dev project is required.

## Helio: owner-only setup

With the repository already linked to the exact approved Dev ref and CLI login
complete, using the declared Node runtime in `website`:

```bash
npm run supabase:dev:env
npm run auth:seed:shared-dev
```

The first command obtains Dev keys via the CLI in memory and writes only
unprivileged values to ignored `.env.local`. It preserves unrelated values and
refuses another linked project or existing remote-target configuration. The
local-only `supabase:env` helper is unchanged: do not run it for shared Dev.

The second command creates exactly one confirmed synthetic Auth identity and its
active profile. It uses a Dev privileged API key only in owner-tool memory, never in
website environment files or logs. Profile creation begins pending; a failed new
fixture is deleted rather than silently leaving setup successful. Existing
accounts/approval states are not overwritten. Repeated setup verifies the saved
fixture; a missing credential file or changed account requires owner inspection,
not an automatic password reset or self-approval.

The CLI may return only a redacted new secret key. In that case the owner tool
can use the available legacy service-role key, verifying its role and exact Dev
ref. This is provisioning-only: application runtime still requires a publishable
key and never reads privileged credentials. No keys are created or rotated.

The randomly generated login is saved outside the repository at
`~/.config/taxtrax/dev-login.json` (Windows: under your user home). Treat that file
as confidential; it is not encrypted. Unix file permissions are owner-only;
protect its Windows ACLs/private storage appropriately. Read it privately and
share through your password manager, never Git, terminal screenshots or chat logs.
No privileged project key is saved there. Lost credentials must be handled by
the owner, not by changing runtime authentication.

## Safe automated checks without Docker

From `website`:

```bash
npm run test:supabase-foundation
npm run test:supabase-shared-dev
npx tsc --noEmit
git diff --check
```

These tests use synthetic in-memory values/temporary files, not the shared
database. The existing `test:portal`, `test:auth-handlers`, `test:session` and
`test:authz` suites require local CLI/Docker fixtures; the last two also use local
signing/database internals. They are not remote-ready and must not be retargeted
by replacing URLs or bypassing their local guards. Keep them for the optional
Docker-local workflow. Do not reset, truncate, globally reseed, or run migrations
against shared Dev as part of ordinary login/logout testing.
