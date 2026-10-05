# Backend login/logout — checkpoint 5

These local backend endpoints use Supabase Auth, the existing client-profile RLS
and server-session layer. Checkpoint 6 connects the [portal server boundary and
existing UI](portal-auth-integration.md). Other dashboard functionality remains
mock/unimplemented; no real client/financial data belongs in this development
portal. This is not a production deployment or a security/compliance certification.

## Request contracts

Both endpoints require POST, `Content-Type: application/json` (optionally UTF-8
charset), `X-TaxTrax-Auth: 1`, and an Origin exactly equal to the configured
`AUTH_ORIGIN`, including scheme, hostname and port. Missing/null origins, sibling
origins, alternate ports/schemes and trailing-slash origin values are rejected.
The configured origin itself must be canonical, HTTPS or local HTTP loopback.
Host and forwarded-host headers do not establish the trust boundary.

If present, Fetch Metadata must be consistent with a same-origin fetch:
`Sec-Fetch-Site: same-origin`, mode `cors`/`same-origin`, destination `empty`.
Absent metadata does not bypass the mandatory Origin/custom-header protections.
OPTIONS and all other supported non-POST methods return noncacheable 405 with
`Allow: POST`; no credentialed CORS or permissive preflight is provided.

Request bodies are limited to 4,096 actual bytes, independent of Content-Length.
Streaming reads have a five-second deadline and reject malformed UTF-8/JSON,
nulls and arrays. This request-body deadline is not a session lifetime policy.

### POST /api/auth/login

Exactly these two fields are accepted:

```json
{"email":"active-a.development@taxtrax.example.invalid","password":"<synthetic local password>"}
```

Email is trimmed and lowercased, at most 254 characters, with a common ASCII
dot-atom/DNS email shape, local part at most 64 characters, and no control
characters. Username login is not implemented. Password must be a nonempty
string no larger than 1,024 UTF-8 bytes. Its whitespace, case and Unicode content
are passed unchanged: no trimming, normalization, truncation or creation-time
complexity rules. Extra fields, including IDs, role/status, redirects, Remember-me
or MFA fields, are rejected.

Success returns only `{"ok":true}` plus the necessary HttpOnly Supabase cookies.
It does not redirect or return identity/session/token fields. The portal UI
performs a fresh navigation to the fixed `/portal` destination; no redirect input is accepted.

### POST /api/auth/logout

The JSON body must be exactly `{}`. Logout uses the current cookie session and
`signOut({scope: 'local'})`, not logout-all. Confirmed success returns only
`{"ok":true}` and expiration writes for the configured cookie family. Other
independent sessions remain valid. SQLite sessions are never read or changed.

## Login transaction and cookie commit

The request boundary and credentials are validated before any provider request.
Sign-in uses a fresh client with empty initial auth storage; inbound cookies
cannot choose its identity or fixate its session. SDK cookie writes are staged
in memory, not applied to a Next.js response during sign-in.

The server then calls `auth.getUser()`, requires confirmed email and queries the
profile using that authenticated client. Existing RLS enforces ownership,
active status and live provider session. Only an eligible result commits the
staged cookies, replacing/deleting obsolete incoming fragments.

For any post-sign-in denial/failure, the handler attempts local revocation using
a separate request-scoped client holding a snapshot of the newly established
session. It discards all positive cookie writes and sends deletion writes only.
The snapshot survives a failed identity check clearing the first client's state.
Pending, suspended, missing-profile and provider/profile failures therefore
cannot leave a partially authenticated browser session. Older independent provider
sessions are not revoked by login; existing browser cookie state is replaced or
cleared, never reused as login authority.

If compensation fails, the response is generic 503, never success, and no new
browser credentials are committed. A provider session can remain until provider
cleanup/revocation succeeds; this cannot be guaranteed during a provider outage.
Tests explicitly simulate that case and clean up the isolated residual session.

## Logout confirmation and failures

The pinned SDK suppresses some logout HTTP 401/403/404 errors. Therefore a null
SDK error alone is not sufficient proof of revocation. The request-scoped fetch
adapter observes only the local logout response status and the narrow
`session_not_found` code; no messages, identities or tokens are exposed/logged.

Success requires provider 2xx, provider-confirmed missing session, or a genuinely
absent incoming session. Replay with already-revoked cookies is idempotent.
Unrelated 401/403/404 errors and network/provider failures return 503 rather than
claiming revocation. The cookie family is expired even on these failures, but
the response explicitly does not confirm that the remote session was revoked.
An otherwise-unexpired JWT can remain live during such an outage. A subsequent
cookie-less request has no current browser session; its idempotent response is
not evidence that an earlier uncertain remote revocation completed.

Malformed/ambiguous cookie families are cleared with 400, not success: guessing
an identity from inconsistent fragments would weaken checkpoint-4 handling.
Valid chunked families are revoked and all observed fragments/base are deleted.
Cookies at other paths/domains that this application never creates cannot be
enumerated remotely. CSRF/body validation failures do not modify auth cookies.

## Errors, caching and abuse prevention

Errors use `{ "ok": false, "error": "<generic message>" }`, matching the existing
response convention without importing SQLite-backed `lib/http.ts` helpers.

| Condition | HTTP status |
| --- | --- |
| Incorrect/unknown credentials, unconfirmed or ineligible client | 401, identical `Unable to sign in.` |
| Invalid fields/JSON/cookie state | 400 |
| Origin/header/Fetch Metadata rejection | 403 |
| Wrong media type | 415 |
| Oversized body | 413 |
| Stalled body | 408 |
| Unsupported method | 405 |
| Provider sign-in abuse limit | 429, generic message |
| Provider/configuration failure or uncertain revocation | 503 |
| Unexpected internal login failure | 500, generic message |

Every handler response has private/no-store cache controls. No caller-controlled
redirect, raw provider/SQL error, request body, password or raw cookie is logged.
Tokens exist only in necessary successful authentication Set-Cookie writes,
never JSON, Location or other response headers.

The local provider's existing rate limits remain enabled and 429 is respected.
No in-memory pseudo-distributed limiter or SQLite rate-limit persistence is added.
Before production, distributed abuse controls and trusted client-IP handling need
deliberate review: server-to-provider traffic can share a provider-side address.
Generic statuses/messages do not constitute a constant-time login guarantee.

## Tests

Use the existing runtime and running local stack. From `website`:

```bash
npm run test:auth-handlers
npm run test:session
npm run test:authz
npm run test:supabase-foundation
npx --no-install tsc --noEmit --incremental false
git diff --check
```

The handler suite provisions isolated synthetic identities and runs exact routes
in a temporary production-mode Next.js 14 app; it does not deploy or modify the
real portal. A loopback-only test proxy forwards unprivileged provider calls to
the actual local Supabase stack and injects controlled provider failures. It
captures fixture sessions only in test memory, without printing/persisting them.
Provider assertion headers, including API version, are retained.

Raw Node HTTP requests ensure forged Fetch Metadata reaches the real handler
unchanged; Node fetch otherwise overwrites some such headers. Tests prove generic
unknown/wrong-password failures, all eligibility denials, no partial cookie
commit, compensating revocation, RLS replay denial, local-only logout,
independent-session survival, cookie cleanup, request boundaries, exact password
handling, response/log safety and concurrent/sequential isolation. Additional
direct-handler cases prove configuration and malformed/stalled reader failures.

Assertions use ordinary JWT/RLS/provider calls, never service-role bypass.
Privileged credentials are used only to create/update/delete isolated fixtures.
Do not disable rate limits to speed tests; if repeated runs hit the provider
window, let the existing window elapse before retrying. No MFA, Remember-me,
activation, recovery, client-data migration or browser SDK is introduced.

References: [Supabase local sign-out](https://supabase.com/docs/reference/javascript/auth-signout),
[Next.js 14 Route Handlers](https://nextjs.org/docs/14/app/building-your-application/routing/route-handlers).
