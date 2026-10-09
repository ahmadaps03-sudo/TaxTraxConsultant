# Admin access-request API (shared Dev)

Ahmed's desktop review UI is implemented. Use the existing
`x-admin-key` boundary; every valid key holder may review/approve/reject. This
shared key identifies no individual, so there is deliberately no `decided_by`.
Setup is in [shared-dev.md](shared-dev.md); manual QA is in [TESTING.md](TESTING.md).
Production is untouched and unconfigured.

## Contract for the desktop UI

All calls target the existing website host, not Supabase directly. Send
`x-admin-key` from Electron's main process. Responses are private/no-store with
no cookies, credentials, invitation proofs or links. The existing main-process
path/method allowlist accepts `/api/admin/accessrequests`, `?id=<UUID>`, and
`/api/admin/accounts`; no broad IPC/network permissions are added here.

The desktop uses GET `/api/admin/accounts` for **all** request records, newest
first, and PATCH `/api/admin/accounts` with exactly `{"id":"<UUID>",
"status":"approved|rejected|suspended"}`. The response is `{ "ok": true,
"data": [...] }` for GET. Each record contains only `id`, `name`, `email`,
`phone`, `company`, `status`, `createdAt`, and `decidedAt` (nullable), using
those exact camelCase names. The desktop filters/searches locally. PATCH
returns the same safe record shape as `data` for the updated row.

| Method/path | Input | Success |
| --- | --- | --- |
| GET `/api/admin/accessrequests` | No query/body | `{ok:true,data:[...]}`; at most 50 pending rows, oldest `created_at` then `id` first. Process/refresh batches; pagination/history UI is deferred. |
| GET `/api/admin/accessrequests?id=<UUID>` | Exactly one UUID query | `{ok:true,data:{...}}`; detail includes terminal/provisioning states. |
| PATCH `/api/admin/accessrequests` | JSON `{"id":"<UUID>","action":"approve"}` | Decision/provisioning/invitation result; see below. |
| PATCH same path | JSON `{"id":"<UUID>","action":"reject"}` | Rejected detail; repeating reject is harmless. |
| PATCH same path | JSON `{"id":"<UUID>","action":"resend_invite"}` | Latest invitation result for an eligible approved client. |

PATCH bodies must have exactly those two keys. No email/name/profile/status
overrides, passwords, reviewer identity, rejection reasons or caller redirect.
JSON is bounded to 4 KiB and five seconds; query/UUID inputs are bounded. Native
desktop clients need no Origin header; supplied browser Origin must equal
`AUTH_ORIGIN`, and conflicting Fetch Metadata is rejected. No permissive CORS.

Errors use `{ok:false,error:"sanitized message",data?:{...}}`: 400 invalid input,
401 unauthorized, 403 cross-origin, 404 missing row, 405 unsupported method,
408 body timeout, 413 oversized body, 415 non-JSON, 409 conflict/busy/ineligible,
503 unavailable/interrupted. Do not treat a timeout/503 as a rolled-back decision;
refresh the detail before retrying.

## State and safe retries

Detail fields are the original request fields plus `decided_at`,
`provisioned_user_id`, `provisioning_status`, `provisioned_at`,
`invitation_status`, `invitation_attempted_at`, `invitation_sent_at`.
Internal operation tokens/leases are never returned.

- `status`: pending / approved / rejected / suspended. Approved records the owner's decision,
  not proof of successful invitation or completed activation.
- `provisioning_status`: not_started / processing / ready / error / blocked.
- `invitation_status`: not_attempted / attempting / sent / failed / unknown.
  **sent means provider acceptance, not proven inbox delivery**. Unknown means
  transport/process interruption prevented confirmation; an email may have sent.

Approval atomically records the decision/claims the row. Only a new identity or
an unconfirmed identity marked for this exact request can be provisioned. A
profile is made active before invitation, with no password chosen by the admin.
Existing unrelated identities are never adopted/modified; provisioning becomes
blocked and requires owner inspection. Suspended/inactive ready profiles are not
reactivated by resend. Deleted provisioned users are not automatically recreated.

Failures after identity creation retain the decision and marked identity. Repeat
approve resumes incomplete provisioning without duplicate users/profiles. Once
an invitation was attempted, repeat approve does **not** send again. Delivery
failure/uncertainty retains approval and the active unconfirmed account; use
explicit resend after inspection. The initial invitation outcome is returned in
the approved detail even when it is failed/unknown.

Claims last 120 seconds as a technical worker lease, not an auth-session policy.
Concurrent/stale workers are fenced by an internal token. If a worker disappears
after starting email delivery, recovery marks the outcome unknown rather than
automatically emailing again. Resend attempts are separated by at least 60
seconds and cannot run concurrently. Confirmed accounts refuse resend; existing
password recovery handles interrupted setup after verification. Do not blindly
retry resend on a transport error because previous delivery may have succeeded.

Reject records the decision time and creates/modifies no Auth user/profile or
email. The existing `/api/admin/accessrequests` treats rejection as final;
the desktop compatibility endpoint may explicitly approve a rejected request.
Public
resubmission retains the original rejected row and returns generic success,
without disclosing the decision or creating another request.

## Authorization and acceptance limits

The website forwards only validated actions through a separate private review
capability to `review-access-requests`. It never forwards the desktop admin key
or user cookies to Supabase. The Edge runtime alone uses its built-in privileged
credential for the restricted review RPC/Auth APIs. Public submission capability
and ordinary Supabase clients cannot review, approve, reject or resend. Table
access remains default-deny; no general service-role table grants are added.

`npm run test:admin-access-requests:shared-dev` uses disposable synthetic rows,
real Dev database/Auth operations and HTTP authorization. Its original review
worker uses no-email invitation proof generation/failure injection. Desktop
compatibility HTTP approval uses `.invalid` synthetic addresses and can trigger
EmailJS delivery attempts, so the test is owner-only and may consume free quota.
It never resets shared data; cleanup removes only its own marked rows/identities.
Real invitation/welcome inbox delivery is deferred and unverified until Ahmed's
EmailJS account/configuration is accessible. A Dev approval proved account and
active-profile provisioning but recorded a failed invitation attempt; no email
arrived. Do not count that as delivery acceptance.

Desktop transitions are pending→approved/rejected, approved→suspended,
suspended→approved, and rejected→approved. Suspension changes the profile to
ineligible and deletes its provider sessions/refresh tokens in the same database
transaction; old access JWTs remain denied by RLS. Reactivation restores
eligibility only for the linked account and requires a new login. Neither action
recreates users/profiles or sends an invitation.

Deferred: individual admin identities/audit attribution, rejection
notifications/reasons, history/pagination UI, background
workers/automatic resend, and Production deployment/hardening.
