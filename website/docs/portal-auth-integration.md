# Client Portal integration — checkpoint 6

The existing portal login/dashboard presentation is now connected to the
Supabase-backed server authorization boundary and checkpoint-5 login/logout
handlers. This completes login/logout for the approved **local-development**
milestone, using synthetic accounts only. It is not a production deployment,
complete tax-data portal, or compliance certification.

## Server authority and client presentation

`app/portal/page.tsx` is a dynamic Server Component. Every render uses
`getCurrentUserResult()` to validate provider identity, confirmed email and the
user-scoped profile query. RLS requires an own active profile and a live provider
session. Authorized clients receive the existing dashboard and only their
server-validated profile name as an identity prop. Anonymous, invalid and
ineligible clients receive the login form. Infrastructure/configuration failures
produce generic unavailable output without dashboard content. Existing middleware
can also return its noncacheable generic 503 when refresh/provider validation fails.

`components/portal/PortalClient.tsx` contains the existing presentation and event
handling. There is no client `loggedIn` authority, auth context, browser Supabase
client, SQLite fallback or token storage. The server helper and portal middleware
retain private/no-store handling; the page is explicitly dynamic.

Login sends exactly `{email, password}` to `POST /api/auth/login`. Password content
is preserved; email normalization remains in the backend. Logout sends exactly
`{}` to `POST /api/auth/logout`, from either desktop or mobile control. Requests
are same-origin JSON with `X-TaxTrax-Auth: 1`. Pending controls and an immediate
submission guard prevent duplicate submissions. Error feedback is generic, not
provider messages or account-status details.

Confirmed success performs a full `window.location.replace('/portal')`, so the
server re-evaluates authorization rather than trusting cached client state.
History restoration also forces server revalidation and hides any restored
portal view while navigating. These safeguards do not themselves authorize users.

On uncertain/failed logout, the UI never claims successful provider revocation.
It navigates to the fixed `/portal?logout=unconfirmed` destination to re-evaluate
the backend's cookie-clearing result while showing generic feedback. This query
flag controls feedback only, never identity/authorization. An outage can leave
the remote provider session alive even though browser cookies were cleared;
another cookie-less request cannot prove the earlier revocation succeeded.

## Deliberately unresolved controls and owner decisions

- **Email or username:** existing wording is preserved, but only email login is
  supported. The owner must approve an email-only label or separately scope
  username authentication. Arbitrary username strings cannot authenticate.
- **Remember me:** visible but disabled, unchecked and marked unavailable. It
  sends no field and changes no session behavior. Persistence/lifetime policy
  remains an owner decision; no custom session expiry or idle timeout was added.
- **Activate account / Forgot password:** existing links are marked unavailable
  and prevent navigation; neither implements a success flow. Local accounts are
  provisioned explicitly using the existing local-only fixture mechanism.
- **MFA:** neither enrollment nor enforcement/bypass policy is implemented.
  The owner must decide the required milestone and enforcement/recovery policy.
  This milestone must not be presented as having MFA protection.
- **Security claims:** the existing “fully encrypted and secure”, “256-bit SSL
  Encryption”, “SOC 2 Type II” and “IRS e-File Standard” copy is unchanged as
  requested. This code does not establish those claims or certifications. They
  require separate owner review and evidence before public use.

Documents, checklist, signatures, billing and other dashboard data/controls stay
as existing mock content. No unrelated backend persistence, SQLite features,
admin-app or Electron behavior was migrated. No sensitive financial data should
be entered during development/tests. Production TLS/deployment, secret management,
distributed abuse controls and broader operational review remain separate work.

## Reproduce and test

Use the existing declared Node runtime (`.nvmrc`), Docker-compatible local stack,
and [foundation instructions](local-supabase.md). From `website`:

```bash
npm ci
npm run supabase:start
npm exec -- supabase migration up --local --workdir ..
npm run supabase:env
npm run auth:seed
npx --no-install playwright install chromium
npm run test:portal
npm run test:auth-handlers
npm run test:session
npm run test:authz
npm run test:supabase-foundation
npx --no-install tsc --noEmit --incremental false
git diff --check
```

Playwright is a pinned development dependency (1.61.1, Node >=18), not browser
runtime authentication code. Chromium needs the OS libraries listed in the
[Playwright browser installation documentation](https://playwright.dev/docs/browsers).
Install OS prerequisites deliberately if your machine lacks them; this checkpoint
does not change the project's Node runtime or install system packages.

The portal suite builds the actual portal Server Component, client components,
auth handlers, middleware and existing CSS in a temporary production-mode Next.js
app. Unrelated site chrome, Google Fonts and analytics are omitted from this
isolated harness to avoid network dependencies and SQLite writes; their repository
files are unchanged. The suite exercises real Chromium and local Supabase through
a loopback-only fault-injection proxy, not mocked authorization. Each test has
isolated browser state and synthetic fixture identities; privileged credentials
are used only for fixture setup/cleanup, never RLS/browser assertions. No traces,
screenshots, persisted browser storage or tokens are written to test reports.

Coverage includes anonymous access, verified identity, generic credential
failures, all ineligible profiles, auth refresh, forged/revoked sessions,
desktop/mobile logout, independent sessions, history restoration, token/log
exposure, exact request/password behavior, pending guards, unchanged layout/mock
content, and infrastructure failures. Existing backend suites remain regression
checks for cookie staging, session liveness, request boundaries and RLS grants.
