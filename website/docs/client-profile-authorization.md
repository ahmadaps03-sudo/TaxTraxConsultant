# Client identity and authorization — checkpoint 3

This adds the client identity/authorization boundary in local Supabase only.
Checkpoint 4 adds [Next.js session/cookie plumbing and middleware](server-session-integration.md).
Checkpoint 5 adds [backend login/logout handlers](auth-handlers.md).
Checkpoint 6 adds [portal protection and minimal UI wiring](portal-auth-integration.md).
Other dashboard functionality remains mock/unimplemented; do not enter sensitive
data. SQLite, admin-app, Electron and other persistence
remain unchanged. No compliance certification follows from this implementation.

## Local commands

Use the existing Node runtime and [foundation setup](local-supabase.md). From
`website`, with the local stack running:

```bash
npm exec -- supabase migration up --local --workdir ..
npm run auth:seed
npm run test:authz
npm run test:supabase-foundation
```

Applying these migrations is additive and local: it resets neither database.
Do not substitute `--linked` or a remote DB URL. Fixtures are provisioned
explicitly, not during start/reset. A local Supabase reset removes synthetic
accounts; re-run `auth:seed` afterward. There is no production provisioning API.

## Live provider evidence collected before migrations

Validated stack: CLI 2.54.0, PostgreSQL 17.6, GoTrue `v2.180.0`.

- `auth.sessions.id`: non-null UUID primary key; `user_id`: non-null UUID FK
  to `auth.users(id)` with cascading deletion. Existing indexes include both.
- Remaining provider columns: `created_at`, `updated_at`, `factor_id`, `aal`,
  `not_after`, `refreshed_at`, `user_agent`, `ip`, `tag`, `oauth_client_id`.
  They remain provider-owned and unmodified.
- Sessions have RLS enabled, no client policies. `postgres` has effective SELECT
  and BYPASSRLS; `anon`/`authenticated` have no SELECT.
- A temporary confirmed synthetic identity signed in using Auth. Its JWT had
  `role=authenticated`, a matching user `sub`, and a UUID `session_id` matching
  the actual session row. Provider `getUser` validated it.
- A temporary postgres-owned SECURITY DEFINER function with empty search path
  successfully inspected that session when called as `authenticated`. Its
  transaction rolled back; the synthetic experiment identity was deleted.
- Provider local sign-out deleted that session row while the JWT remained
  unexpired. Repeatable tests additionally prove replay denial and that another
  independent session remains authorized.

No provider credential/token was printed or persisted. Revalidate these
assumptions on stack upgrades. They agree with [Supabase session
documentation](https://supabase.com/docs/guides/auth/sessions), but were verified
against the installed stack, not inferred solely from documentation.

## Schema, grants and RLS

`public.client_profiles` has exactly four columns:

- `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`.
- `name TEXT NOT NULL`: stored trimmed, 1–100 PostgreSQL characters, no control
  characters. Trimming includes common Unicode surrounding whitespace.
- `status TEXT NOT NULL DEFAULT 'pending'`: only `pending`, `active`, `suspended`.
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`.

Auth owns email, credentials and sessions. No extra fields, signup triggers or
speculative indexes are added; the primary-key index serves this slice.

Explicit REVOKE overrides the stack's default grants. Effective privileges:

| Role | Profile table | Helper |
| --- | --- | --- |
| PUBLIC / anon | none | no EXECUTE |
| authenticated | SELECT only | private-schema USAGE + EXECUTE only |
| service_role | SELECT/INSERT/UPDATE/DELETE for local provisioning | no EXECUTE |
| postgres | trusted owner privileges | explicit trusted owner |

Clients have no column-grant loopholes or write policies and cannot approve
themselves. RLS has exactly one authenticated SELECT policy requiring all of:
`user_id = auth.uid()`, `status = 'active'`, and a live provider session. Tests
check the policy count so another permissive OR-policy cannot silently broaden
access. No SQLite identity or editable user metadata grants client authorization.

## SECURITY DEFINER review

`private.client_session_is_live()` takes no parameters and returns only boolean.
Its explicit owner is `postgres`; search path is empty, objects schema-qualified,
and session UUID shape checked before an indexed UUID lookup. It requires both
session ID and user ID to match authenticated claims. Missing UID/session,
malformed session identity, nonexistent/revoked row and mismatched identities
fail closed.

SECURITY DEFINER is needed because clients cannot SELECT `auth.sessions`.
Granting that table would disclose arbitrary provider metadata; this function
instead returns only existence for the current claimed identity, never rows.
Authenticated users cannot CREATE/replace private objects. PUBLIC execution is
revoked, including the migration owner's future private-function defaults.
The provider's trusted signing/API layer validates JWT authenticity; this
database function does not perform cryptographic verification.

Only `public` is exposed to PostgREST: neither `private` nor `auth` is available
through API schema selection. Tests demonstrate that modifying signed JWT
identity claims causes rejection. SQL edge-case tests explicitly switch to
non-BYPASSRLS `authenticated`; they are not service-role RLS assertions.

This is a provider-session **row-existence/revocation** check, not an expiration
or MFA policy. No custom lifetime, idle timeout, AAL rule or Remember-me behavior
is added. Provider columns such as `not_after` are not treated as approved
application policy. Revocation affects subsequent database statement snapshots,
not cancellation of an already-running transaction. Future MFA enforcement must
tighten this boundary deliberately, not introduce another permissive policy.

## Synthetic provisioning

Privileged credentials are obtained in memory from the pinned local CLI, not
`.env.local`. URL/project checks and SDK requests restricted to the local origin
with redirects disabled prevent remote-target use. No service credential or
session token is printed or written to a runtime/file environment.

Fixed local accounts, all under `@taxtrax.example.invalid`:

| Email local part | Initial profile | Auth confirmation |
| --- | --- | --- |
| `active-a.development` | active | confirmed |
| `active-b.development` | active | confirmed |
| `pending.development` | pending | confirmed |
| `suspended.development` | suspended | confirmed |
| `no-profile.development` | absent | confirmed |
| `unconfirmed.development` | absent | unconfirmed |

Their synthetic local-only password is `TaxTrax-synthetic-local-only-2026!`.
Never reuse it outside this stack. Unconfirmed accounts cannot sign in; this
does not implement account activation or recovery.

Provider-controlled app metadata marks fixture ownership only. Unmanaged email
collisions are rejected. Repeated runs preserve existing passwords, names,
confirmations and approval statuses; suspended/pending accounts are never
reactivated. A missing profile for an existing managed user is recreated pending,
not approved. An unexpected profile for a no-profile fixture causes refusal.

New profiles start pending; only a newly created, completely provisioned fixture
gets its designated final status. Profile failure deletes that newly created
Auth identity, cascading partial profiles. Cleanup failure is reported loudly.
Earlier fully provisioned fixtures may remain after a later fixture fails; a
retry is idempotent. No SQLite users/checklists/documents/signatures are created.

## Tests and limitations

`test:authz` creates separate random-UUID fixture namespaces and deletes them
afterward; it does not mutate the fixed development accounts. HTTP RLS assertions
use only unprivileged keys and real client JWTs. Privileged operations are fixture
setup/cleanup and schema/grant inspection; pgTAP constraint mutations affect
fixtures only and roll back. Failed profile creation is fault-injected and its
Auth cleanup is verified against the real local provider.

Tests cover A/B isolation, all inactive/no-profile cases, anonymous denial,
client write/self-promotion denial, forged JWTs, schema exposure, malformed or
missing identities, revocation with unexpired JWT replay, independent-session
survival, unconfirmed sign-in, idempotency, remote refusal, schema constraints
and effective privileges.

Only the profile table is protected here. Legacy SQLite endpoints, future
documents/storage and other models need separate bounded work. Portal protection
is not implemented, and existing unsupported security/compliance copy remains
unchanged for owner review. MFA/session product decisions remain unresolved.

References: [PostgreSQL SECURITY DEFINER](https://www.postgresql.org/docs/17/sql-createfunction.html),
[PostgreSQL RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).
