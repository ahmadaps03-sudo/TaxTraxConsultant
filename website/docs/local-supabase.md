# Local Supabase foundation (checkpoints 1–2)

This repository has a reproducible **local-only** Supabase project. Checkpoint 3
adds client-profile migrations, RLS and synthetic provisioning; see
[client-profile authorization](client-profile-authorization.md) for setup/tests.
Checkpoint 4 adds [server session integration](server-session-integration.md).
Checkpoint 5 adds [backend login/logout handlers](auth-handlers.md).
Checkpoint 6 adds [portal server authorization and minimal UI integration](portal-auth-integration.md).
Login/logout now works for deliberately provisioned synthetic local accounts.
Other dashboard functionality remains mock/unimplemented; do not put real client
or financial data in this development portal.

Existing contact, bookings, leads, analytics, content, admin CRUD, and local media
continue to use the unchanged SQLite/filesystem backend. Supabase does not replace
that persistence in this slice. Nothing here is production configuration or a
deployment/compliance certification.

## Prerequisites and compatible pins

- Use the existing `website/.nvmrc`: **Node 20.18.0**, with its bundled npm 10.8.2.
  The existing package engine range remains `>=18.18.0 <21.0.0`; it is not changed.
- Install and start a Docker-compatible runtime with access to its Docker API.
  Docker Desktop, Docker Engine, or a compatible alternative can be used. The
  scripts require a bridge network with loopback host binding; they fail rather
  than silently expose services when that setup is unavailable.
- Initial installs and Docker image pulls need internet access, disk space, and
  sufficient memory. Later starts reuse the local images and database volume.
- Ports 55320–55324 must be available (55320 is reserved for a future shadow DB).
  This dedicated range avoids collisions with other projects using default ports.

Pinned packages:

| Package | Version | Reason |
| --- | --- | --- |
| `@supabase/supabase-js` | `2.78.0` | Supports the existing Node 18/20 range; later releases require newer Node. |
| `@supabase/ssr` | `0.8.0` | Compatible `supabase-js` peer (`^2.76.1`); used by checkpoint-4 server session integration. |
| `server-only` | `0.0.1` | Guards the server session and authorization modules against browser imports. |
| `supabase` | `2.120.0` | Pinned project-local CLI with a Node launcher, verified using the existing Node 20 runtime. |
| CLI-only `tar` override | `7.5.22` | Retained legacy archive override; the current CLI Node launcher no longer depends on `tar`. |

No test framework dependency is needed here: helper tests use Node's built-in
test runner. The lockfile pins transitive dependencies as well. These are
compatibility pins, not a claim that old Node/Next versions are suitable for a
future production deployment; that assessment remains separate work. Do not run
`npm audit fix --force` or automatically change runtime versions.

## Fresh clone

From the repository root, using the already-declared Node runtime:

```bash
cd website
npm ci
node -e "const fs = require('node:fs'); if (!fs.existsSync('.env.local')) fs.copyFileSync('.env.example', '.env.local', fs.constants.COPYFILE_EXCL);"
npm run test:supabase-foundation
npm run supabase:start
npm run supabase:status
npm run supabase:env
npm run dev
```

If using nvm, `nvm install` / `nvm use` inside `website` select the existing
`.nvmrc`, not a new runtime policy. No global Supabase installation or Supabase
account/login/link is required. Do not run `supabase init`: the configuration is
already committed at the repository root, and every script selects that root
independently of your shell's working directory.

The copy command never overwrites an existing environment file. Configure the
existing website variables as usual, including the shared `ADMIN_API_KEY` if
using the desktop admin locally. The Supabase helper neither generates nor
replaces those unrelated settings.

`supabase:start` creates/reuses the dedicated `taxtrax-supabase-local` Docker
bridge network with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`.
An existing network with a different binding is rejected. Keep these services
local; do not forward their ports or use real data. If another local Supabase
project occupies the ports, stop that project deliberately before starting this
one; the scripts do not stop other projects automatically.

## Configuration

`../supabase/config.toml` selects:

- Project ID: `taxtrax-client-auth`; PostgreSQL 17, port 55322.
- API: `http://127.0.0.1:55321`, exposing only the `public` schema.
- Studio: `http://127.0.0.1:55323`.
- Captured development email: `http://127.0.0.1:55324`; no production SMTP.
- Auth site: `http://localhost:3000`; exact additional redirects to
  `http://localhost:3000/portal` and `http://127.0.0.1:3000/portal` (no wildcard).
- Public signup disabled by `auth.enable_signup = false`; anonymous signup/login
  disabled. **`auth.email.enable_signup = true` is intentional:** in this pinned
  CLI it maps to GoTrue's `GOTRUE_EXTERNAL_EMAIL_ENABLED`. Setting it to false
  also disables email/password login. The global signup switch still prevents
  public account creation.
- Email confirmation required. Future deliberately provisioned synthetic local
  accounts must explicitly be confirmed through local administrative provisioning,
  or complete a captured-email confirmation. Checkpoint 3 provides local fixtures.
- Refresh-token rotation enabled; provider defaults otherwise remain in effect.
  No custom JWT/session lifetime, inactivity timeout, Remember-me policy, or MFA
  enrollment/enforcement/bypass policy is introduced.
- Seeding, Storage, Realtime, Edge Runtime, analytics, and the DB pooler disabled.
  Supabase's own internal database setup is expected. Checkpoint-3 profile
  migrations are included in the repository; fixtures use explicit SDK provisioning, not SQL seeds.

## Environment and secrets

`npm run supabase:env` reads JSON status from the pinned project-local CLI, checks
the local API URL and unprivileged key type, and checks local Auth health before
writing `website/.env.local`. It writes only:

```dotenv
SUPABASE_URL="http://127.0.0.1:55321"
SUPABASE_PUBLISHABLE_KEY="<local sb_publishable_ key>"
AUTH_ORIGIN="http://localhost:3000"
```

The website runtime requires the `sb_publishable_` key format validated by
`lib/supabase/config.ts`. Legacy anon JWT keys are not accepted as application
runtime configuration.

Existing unrelated assignments (including `ADMIN_API_KEY`, analytics, site URL,
and SQLite settings) are preserved. A valid existing local `AUTH_ORIGIN` is
preserved; remote or ambiguous origins are rejected. These variables are not
`NEXT_PUBLIC_*`. No service-role key, secret key, database password/URL, JWT
signing secret, or storage credential is selected or written. The helper also
refuses existing privileged Supabase assignments instead of copying them into a
new runtime file.

Updates use a same-directory temporary file and atomic rename, with owner-only
permissions on systems supporting Unix permissions. Symlinks and concurrent
edits are rejected. Failed status/health/validation checks leave the existing
environment unchanged. Runtime environment files and Supabase temporary state
remain Git-ignored. Re-run the helper after a local stack reset or credential
change; restart Next.js when its environment changes.

Lifecycle scripts suppress the CLI's credential-bearing output. Status prints
only service URLs. If debugging directly with the CLI, its raw `status` and
`start` output may contain **privileged** development credentials: do not copy
that output into `.env.local`, Git, tickets, or logs. Studio is a local
administrative tool; its privileged capabilities do not belong in the website
runtime.

## Stop, inspect, and explicitly reset

```bash
npm run supabase:status
npm run supabase:stop
npm run supabase:start
```

Stopping preserves this project's local Supabase database volume. It does not
stop other projects, remove the dedicated network, or affect SQLite.

**Destructive to local Supabase data only:**

```bash
npm run supabase:reset -- --confirm-local-reset
npm run supabase:env
```

The reset helper rejects missing confirmation and remote/linked DB arguments;
it always invokes `db reset --local --no-seed` for this repository. Do not use it
if you need existing local Supabase data. It never opens or resets SQLite. Reset
is not required for initial setup and is not run as part of checkpoint verification.

## Verification and troubleshooting

```bash
npm run test:supabase-foundation
npm run supabase:status
npm run supabase:env
```

Tests cover local URL/key validation, privileged credential rejection, preserving
unrelated values, idempotency, line endings, file permissions, symlinks,
unavailable services, and refusing unsafe lifecycle arguments. They use synthetic
values and temporary files only; they do not require Docker or access developer
SQLite data. RLS tests are documented in the checkpoint-3 guide; server/session
tests are documented in the checkpoint-4 guide.

For Docker access errors, confirm your Docker-compatible runtime is running and
your user can execute `docker info`. Do not automatically change socket
permissions. If the stack fails, inspect its local containers and image-download
errors; avoid sharing credential-bearing diagnostic output. Configuration
changes take effect after a stop/start. The website's unrelated SQLite features
do not require the Supabase stack to be running.

References: [Supabase local development](https://supabase.com/docs/guides/local-development),
[CLI configuration](https://supabase.com/docs/guides/local-development/cli/config).
