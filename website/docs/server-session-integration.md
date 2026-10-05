# Server session integration — checkpoint 4

This checkpoint supplies server session plumbing. Checkpoint 5 adds
[application login/logout endpoints](auth-handlers.md), and checkpoint 6 connects
the [portal server boundary and existing UI](portal-auth-integration.md).
Middleware does not protect portal data by itself: the portal page now calls the
server authorization helper before rendering the dashboard. Other dashboard
functionality remains mock/unimplemented. Do not put sensitive data in this
development portal.

## Request-scoped server clients

`lib/supabase/client.ts` creates a fresh `@supabase/ssr` client and cookie state
for each invocation. Only `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are read.
The URL must be an HTTPS origin, or HTTP loopback for local development, without
credentials, path, query or fragment. A missing/invalid configuration or a key
other than `sb_publishable_*` fails with a generic configuration error. The
local pinned stack provides that key; a legacy anon-key fallback produced by
older tooling is not accepted by this application layer.

All integration modules are marked `server-only`. No browser client, shared
session-bearing singleton, localStorage, privileged runtime credential, SQLite
fallback, or global identity memoization exists. Supabase requests stay on the
configured origin, reject redirects, use `cache: no-store`, and have a five-second
network timeout unless an explicit request signal is supplied. Network errors
become generic provider failures rather than logging request/token contents.

`createPortalServerClient()` uses Next.js 14 `headers()`/`cookies()` and
`unstable_noStore()`. It is read-only by default for Server Components. The
explicit writable mode is available for Route Handlers; those handlers
must also call `setPrivateNoStore()` on every response. Checkpoint-5 handlers
instead stage cookie writes until the appropriate authentication decision.
Server rendering that unexpectedly refreshes without a writable cookie sink
returns `unavailable`, not an identity whose replacement cookies would be lost.

## Cookie adapter

The Supabase cookie family uses the SDK-compatible project name (locally
`sb-127-auth-token`), never the legacy SQLite cookie. Every write forces:

- HttpOnly, SameSite=Lax, Path=/ and no Domain attribute.
- Secure in production, non-Secure only for HTTP local development.
- The SDK's chunking, expiration and deletion writes retained unchanged.

The SDK's existing default persistence is retained; this is not a custom
session lifetime or a Remember-me implementation. Owner decisions about those
policies remain unresolved. HttpOnly is appropriate because this slice has no
browser Supabase client; later browser auth integrations need deliberate review.

Raw Cookie headers are parsed before Next.js can collapse duplicate names.
Duplicate cookies, simultaneous base/chunk formats, noncanonical/gapped chunk
numbers, incomplete encodings, invalid UTF-8/JSON and malformed session shapes
discard the entire auth family. Parse bounds (32 chunks, 65,536 encoded
characters) prevent unbounded processing; they are not authorization policy.
Invalid cookies are expired where the response is writable. Unrelated cookies
remain intact. Parsing session shape is only rejection/sanitization, never
proof of identity: only provider validation plus RLS can authorize a client.

## Portal-only middleware

`middleware.ts` matches exactly `/portal/:path*`. The middleware calls
`auth.getUser()` to validate/refresh provider state, forwards replacement cookies
to the downstream request, and writes the same accumulated changes to the browser
response, including obsolete chunk deletions. It applies private/no-store cache
headers without replacing existing security headers. Next.js development mode
can override Cache-Control with its own no-store value; the production harness
verifies private/no-store behavior and security-header preservation.

Anonymous, pending, suspended, and no-profile clients are not redirected or
approved by middleware. It never queries profiles or acts as an authorization
decision. Missing configuration/provider outage gives a generic noncacheable 503;
invalid sessions are cleared rather than granted access. Unrelated routes are
not intercepted. Its imports do not reach SQLite or Node-only database modules.

## Current-user boundary and failures

`getCurrentUserResult()` in `lib/auth/current.ts` performs:

1. Fresh request-scoped client creation and provider `auth.getUser()` validation.
2. Rejection of absent, invalid, email-less or unconfirmed identities.
3. A user-scoped `client_profiles` query; existing RLS requires the user's own
   active profile and the live provider session.
4. A safe identity containing only `{id, email, name}`.

It never authorizes with `getSession()`, decoded JWTs, cookie/user metadata,
caller-supplied IDs, privileged queries or legacy SQLite sessions. The revoked
session row check remains authoritative even when the provider accepts a JWT
whose expiration is still in the future. Another independent live session can
remain authorized.

Internally, results distinguish `authorized`, `ineligible` (anonymous/invalid,
unconfirmed, or no active profile), and `unavailable` (configuration, provider,
or lost cookie persistence). `getCurrentUser()` returns null for ineligibility
and throws a generic error for infrastructure failure. Do not serialize internal
reasons or provider errors into future API/UI responses. The unused
`requireUserPage()` redirects only to the fixed portal entry; do not call it on
the entry page itself. The old unused redirect-string helper was removed; no
caller-controlled redirect is introduced.

All failures are closed. No custom lifetime, idle timeout, MFA/AAL enforcement
or bypass, Remember-me, activation or password-recovery behavior is added.
Future MFA must tighten both server authorization and RLS deliberately.

## Verification

Use the existing declared Node runtime and running local stack from the
[foundation](local-supabase.md) and [authorization](client-profile-authorization.md)
guides. From `website`:

```bash
npm run supabase:status
npm run test:supabase-foundation
npm run test:authz
npm run test:session
npx --no-install tsc --noEmit --incremental false
git diff --check
```

The session suite uses random-namespace synthetic local accounts and removes
them afterward; ordinary authorization assertions use only unprivileged
clients. It checks active A/B isolation (including sequential/concurrent requests),
inactive/missing profiles, forged identity metadata/signatures, malformed chunks,
revocation/replay, surviving independent sessions, refresh propagation,
configuration/provider failures and cookie/cache security. Unconfirmed Auth
users cannot obtain real sessions; provider-returned unconfirmed identity is
also fault-injected to prove this server guard, while checkpoint-3 tests prove
the real sign-in rejection.

Expired-token setup signs a synthetic expired JWT using the local signing key
obtained in memory from CLI status only, with a real valid refresh state.
It never changes provider configuration or writes/logs tokens or credentials.
Infrastructure errors are fault-injected, not caused by stopping the shared stack.

An isolated temporary Next.js 14 application copies the exact session modules,
middleware, TypeScript and Next config and runs a local production build/server.
It verifies the real Edge middleware/Server Component chain, refresh cookies,
identity isolation, cache/security headers and unrelated route behavior. This
is not a deployment and never modifies the existing portal or its dev server.
Non-framework unit tests transpile temporary copies without the `server-only`
import; the actual Next.js harness retains and validates those guards.

The pinned Supabase SDK emits build warnings about guarded Node-version checks
in its bundled SDK/Realtime code in the Edge bundle. The production harness
exercises Auth/profile/refresh successfully; Realtime is not used. No dependency
or runtime changes are made to suppress those warnings. Revalidate Edge behavior
and the provider schema when the approved dependencies are upgraded.

Only client identity/profile authorization is covered. Existing unrelated
SQLite endpoints/storage still need their own bounded work. Unsupported
marketing/security claims are not edited here. This implementation provides no
compliance certification and is not approval for production use.
