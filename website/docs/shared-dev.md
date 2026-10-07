# Shared Development setup (no Docker)

Use only TaxTrax DEVELOPMENT (`dbcakdqthnamgjfkkxzn`). Production is not a test
target. Existing authentication, profile RLS and provider-session checks are
unchanged. SQLite remains local for unrelated website/admin features. Password
recovery now uses Supabase Auth and a signed EmailJS hook. MFA, Remember me,
activation and other portal functions remain deferred; this is
not a production deployment or compliance certification.

This guide covers environment setup and starting the app. For feature-by-feature
manual QA, use the canonical [backend testing guide](TESTING.md).

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

Follow the [Client Portal login/logout manual checks](TESTING.md#client-portal-loginlogout)
for expected behaviour and PASS/FAIL criteria.
If port 3000 is occupied, stop your own earlier dev server deliberately; do not
silently use another port without updating `AUTH_ORIGIN`. Restart after changing
environment values. Other dashboard data/controls remain mock content.

No Docker, Supabase CLI login/link, migration push or admin key is required for
Ahmed's portal test. Internet access to the shared Dev project is required.

## Recovery email setup (owner only)

The website still needs only the three Supabase/origin variables above. EmailJS
credentials belong to the Dev `send-recovery-email` Edge Function, not browser
code or website authentication runtime. The empty additional names in
`.env.example` are owner setup reminders; Ahmed does not need EmailJS keys.

Reuse Ahmed's intended Dev EmailJS service and recovery template. Set the
template's **To Email** field to `{{to_email}}` and its reset-link target to
`{{recovery_url}}`; putting the recipient only in the message body is not enough.
The deployed service/template IDs must match those selected in EmailJS. Allow
server-side/non-browser API requests and ensure private-key authorization matches
the deployed `EMAILJS_PRIVATE_KEY` (sent server-side as `accessToken`). Disable
link tracking and CC/BCC without breaking unrelated email integrations. Set these
secrets privately in the **Dev** Edge Function dashboard:

```text
EMAILJS_SERVICE_ID
EMAILJS_TEMPLATE_ID
EMAILJS_PUBLIC_KEY
EMAILJS_PRIVATE_KEY
SEND_EMAIL_HOOK_SECRET
RECOVERY_ALLOWED_ORIGINS
```

Use the same dashboard-generated Send Email hook secret (`v1,whsec_…`) for the
hook/function. The origin allowlist is exact, comma-separated; shared Dev currently
permits only `http://localhost:3000`. Never upload the whole website `.env.local`,
which contains unrelated secrets; use the dashboard or an owner-only secrets
file outside Git. Never put credentials in `NEXT_PUBLIC_*`, Git or screenshots.

To redeploy without Docker, from `website`:

```powershell
.\node_modules\.bin\supabase functions deploy send-recovery-email --workdir .. --project-ref dbcakdqthnamgjfkkxzn --no-verify-jwt --use-api
```

In Dev **Authentication > Hooks**, enable Send Email with URL
`https://dbcakdqthnamgjfkkxzn.supabase.co/functions/v1/send-recovery-email`.
In **Authentication > URL Configuration**, keep the site URL local and explicitly
allow `http://localhost:3000/api/auth/recovery/callback`; preserve other approved
entries. Do not push the whole local config. The signature-verified hook handles
recovery only; unsupported email actions fail closed, not silently successful.
Only already-confirmed Auth identities receive recovery emails; this is not an
account activation path. Verification/update still require an active own profile.

Supabase owns proof generation, verification and expiry (currently one hour in
Dev). EmailJS receives the recipient/recovery link, never passwords/session tokens.
Free quotas/rate limits still apply; generic, padded request feedback intentionally
does not reveal delivery status or account existence. The process-local 60-second
per-email cooldown complements provider limits, not distributed abuse protection.

Recovery links work in another browser without requester PKCE storage. The
callback moves proof to a scoped HttpOnly cookie and strips it from the URL;
**Continue** verifies it, rather than consuming it on an email-scanner GET.
Separate HttpOnly reset cookies do not log into the portal. After a successful
reset, all that user's sessions are revoked and a fresh login is required.
Ordinary logout stays current-session-only; recovery does not approve profiles.
Links themselves are confidential bearer proofs: never share them in reports.
Use `npm run dev`, whose wrapper redacts callback proof values from Next.js logs.

For manual recovery QA, use the separately provisioned deliverable synthetic
account: confirmed Auth identity, active profile named **Synthetic Recovery
Client**, and an inbox Hélio can access. Obtain its email, current password and
inbox access privately from Hélio; never commit them. The original `.invalid`
fixture and `auth:seed:shared-dev` are for login/logout only, not email delivery.
After a reset, update the password manager/private shared credential; an initial
provisioning credential file is no longer the current password. Follow
`TESTING.md`, not owner provisioning commands.
Production remains unconfigured: approve HTTPS origins/redirects, separate hook
secrets, request-log redaction, email security/quotas/monitoring and distributed
abuse prevention before deployment. No paid feature or Production setting is added.

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
No privileged project key is saved there. Lost credentials for the original
non-deliverable fixture still require owner handling; use the separate deliverable
synthetic account for recovery tests.

## Safe automated checks without Docker

From `website`:

```bash
npm run test:supabase-foundation
npm run test:supabase-shared-dev
npm run test:recovery
npx tsc --noEmit
git diff --check
```

These tests use synthetic in-memory values/temporary files, not the shared
database. Owner-only `npm run test:recovery:shared-dev` also tests real Dev
Auth/RLS and browser recovery, with uniquely named disposable synthetic users.
It needs CLI login/link and installed Playwright Chromium, creates/deletes only
its own marked fixtures, does not send email or alter existing users, and never
resets schemas/data. Actual inbox delivery remains a manual test in `TESTING.md`.
The existing `test:portal`, `test:auth-handlers`, `test:session` and
`test:authz` suites require local CLI/Docker fixtures; the last two also use local
signing/database internals. They are not remote-ready and must not be retargeted
by replacing URLs or bypassing their local guards. Keep them for the optional
Docker-local workflow. Do not reset, truncate, globally reseed, or run migrations
against shared Dev as part of ordinary login/logout testing.
