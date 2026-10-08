# TaxTrax backend manual testing

This is the canonical manual QA guide for TaxTrax backend features. Every
completed backend feature should have its own section with prerequisites,
steps, expected behaviour and explicit PASS/FAIL criteria.

**Setup = [shared-dev.md](shared-dev.md). Feature testing = this file.**
Link to existing setup instructions rather than duplicating them here.

## Client Portal login/logout

### Prerequisites

- On Windows, run `git checkout dev` and `git pull` from the repository root.
- Complete [shared Development setup](shared-dev.md), then start the app with
  `npm run dev` from `website`. Keep that terminal running.
- Obtain the synthetic shared-Dev login credentials privately from Hélio.
  Never include credentials, tokens or cookies in test reports/screenshots.
- Use **http://localhost:3000/portal** consistently and test Development only.
  No AI tool, Docker, local Supabase or owner provisioning commands are needed.
- Use a normal browser window and a separate Incognito/InPrivate window.
  Start with both logged out; use **Log out** if already signed in. Close all
  private windows before opening a fresh private session, since private windows
  in the same browser can share a session.

The form still says “Email or username”, but authentication is **email-only**.
Remember me only saves the email on this device; it does not change session
duration. Backend persistence policy and MFA remain deferred. First-time setup is invite-only, tested
in its own section below. Other dashboard content is mock data, not functionality
under test.

### Manual checks

Run these checks in order. Mark PASS only when the entire expected result is
observed; otherwise mark FAIL and record the failing step.

| ID | Exact action | Expected result / PASS criteria |
| --- | --- | --- |
| 1 | In the logged-out normal window, open `http://localhost:3000/portal`. | **Client Portal Login** appears with identifier/password fields and a login button. No authenticated dashboard or welcome name appears. |
| 2 | Enter the synthetic Dev email and its correct password; click **Log In to Secure Portal** once. | Login completes and the page navigates freshly to `/portal`, showing the dashboard rather than a login error. |
| 3 | After test 2, inspect the dashboard and address bar. | The URL is `http://localhost:3000/portal`, and the heading reads **Welcome, Synthetic Shared Dev Client**. The name is the verified profile name, not the typed email. |
| 4 | Open a fresh private window at `/portal`. Submit the synthetic email with a deliberately incorrect password. | Login stays visible with **Unable to sign in.** No dashboard is shown. |
| 5 | In the same private window, submit `manual-qa-unknown@taxtrax.example.invalid` with a nonempty password. Do not create that account. | The same **Unable to sign in.** feedback appears as in test 4; no account-existence detail or dashboard is shown. |
| 6 | Still logged out in the private window, type `http://localhost:3000/portal` directly into the address bar and press Enter. | The existing login UI renders at `/portal`, not an authenticated dashboard. Remaining on `/portal` is expected; a redirect is not required. |
| 7 | In that private window, log in with the correct synthetic credentials, then click the visible **Log out** control. | Logout completes and returns to the login UI at `/portal`, without an unconfirmed-sign-out error. |
| 8 | After test 7, open `/portal` directly again and refresh. If browser Back returns to a portal page, refresh that page too. | Every fresh portal load shows login, not the authenticated dashboard. |
| 9 | Return to the normal window, which is still signed in from test 2, and refresh `/portal`. | The dashboard remains authorized and still displays **Welcome, Synthetic Shared Dev Client**. |
| 10 | Close all private windows, then open a new Incognito/InPrivate window at `/portal` while the normal window remains signed in. | The fresh private window shows login; it is not automatically authenticated by the normal browser session. |
| 11 | Log in with the synthetic credentials in that private window, then log out there. Refresh `/portal` in the normal window. | Private-window logout returns to login, while the normal window still shows the verified dashboard. Logout affects only the independent private session. |
| 12 | In the authenticated normal window, use a desktop viewport at least 1024 pixels wide. Click **← Log out** in the sidebar. | Logout completes and the login UI replaces the dashboard at `/portal`. Refresh remains unauthenticated. |
| 13 | Log in again in the normal window. Resize to a narrow/mobile viewport (for example, 390 pixels wide using browser DevTools). Click **Log out** beside the welcome heading. | The narrow-view logout control is usable and returns to login. Refresh at `/portal` does not restore authenticated access. |

If the app shows an unavailable state or a login/logout infrastructure error,
record FAIL rather than treating it as a successful authorization test. Do not
change accounts, reset the shared database or use Production to work around it.

### Report results

Send Hélio the following concise report, with secrets removed:

```text
Feature: Client Portal login/logout
Dev commit tested:
Browser/version:
Manual results: 1 PASS/FAIL, 2 PASS/FAIL, ... 13 PASS/FAIL
Failures: test ID, steps, expected vs actual, screenshot/error output
Unexpected behaviour:
```

## Client Portal password recovery

### Prerequisites

Complete [shared Dev setup](shared-dev.md) and start the app with `npm run dev`.
Obtain the **deliverable synthetic Dev account**, its current password and inbox
access privately from Hélio. Do not use the original `.invalid` fixture. Use Dev
only, and update the privately shared test password after a successful reset.
No Docker, local Supabase or AI tool is needed.

The recovery account is already confirmed and has an active **Synthetic Recovery
Client** profile. First log into a normal browser window with its current
password and leave it signed in, so R6 can verify revocation. Perform R1–R6 in a
separate fresh InPrivate/Incognito window. The initial provisioning password is
stale after a reset; obtain the latest privately shared password for repeat QA.

### Manual checks

| ID | Exact action | Expected result / PASS criteria |
| --- | --- | --- |
| R1 | Open `http://localhost:3000/portal` logged out and click **Forgot password?**. | The minimal email-only recovery form opens. The existing login layout remains unchanged. |
| R2 | Submit the deliverable synthetic account email using **Send recovery email**; check its inbox/spam folder. | Generic “If an account can receive…” feedback appears. A recovery email arrives through the configured Dev EmailJS recovery template, with the correct recipient and local recovery link. No password/session token is in the email. The generic feedback alone is not proof of delivery. |
| R3 | Open that email link in a fresh InPrivate/Incognito browser, with the app still running. | The URL becomes `/portal/reset-password` with no proof in the address bar. A **Continue** button appears. Opening/reloading the link before Continue does not consume it. |
| R4 | Click **Continue**, then open `/portal` in another tab of this private window. | The new-password form appears, but `/portal` still shows login: verification alone does not grant portal access. Refreshing the reset page preserves the form. |
| R5 | Try a short/common password or mismatched confirmation, then correct it. | Invalid input is rejected; no successful reset occurs. The existing link/session still allows a corrected password following the displayed 10–128-character rules. |
| R6 | Set a new synthetic password following the rules, confirm it exactly, and click **Update password**. Refresh `/portal` in the normal window left signed in during prerequisites. Then test new and old passwords and update the privately shared credential. | Reset returns to login. The new password works and displays **Welcome, Synthetic Recovery Client**; the old password fails. Other previously authenticated sessions for this account show login after refresh. A different account's sessions are unaffected. |
| R7 | Open the used email link again and click Continue. Try a malformed link; separately request a new link and leave it unused beyond the current Dev one-hour expiry before trying Continue. | Invalid/used/expired proof is rejected with generic invalid/expired feedback; no authorized password form or portal is granted. **Request a new link** remains available. Never share links in reports. |
| R8 | Submit a valid-looking unknown email (`recovery-unknown@taxtrax.example.invalid`), and retry the known email within 60 seconds. | Both show the same generic request feedback, without account-existence or delivery details. A cooldown may suppress another email. |
| R9 | After resetting, log in and use desktop/mobile logout as in the login/logout section. | Existing login/logout still works; normal logout affects only its current session. |

Report R1–R9 PASS/FAIL, Dev commit, browser/version and sanitized screenshots/error
output for failures. Record actual EmailJS arrival and unexpected behaviour.
Never include passwords, recovery URLs, cookies or tokens. For cross-device
testing, `localhost` must resolve to a running Dev app on the opening device;
do not replace it with an unapproved host.

## Client Portal account activation

### Acceptance status

The activation implementation is complete for shared Dev. Final real
invitation-email delivery QA is **deferred**, pending Ahmed's separate EmailJS
invitation template/configuration described in [owner setup](shared-dev.md#first-time-setup-owner-invitation-setup).
Offline and email-free shared-Dev checks do not establish inbox delivery or
manual acceptance. Once configured, Hélio should explicitly resend to the
retained approved, unconfirmed synthetic account, then Ahmed runs A1–A9 below
and records actual email arrival and first-time setup results.

### Prerequisites

Complete [shared Dev setup](shared-dev.md) and keep `npm run dev` running at
`http://localhost:3000`. Ask Hélio to approve and invite a **new deliverable
synthetic Dev identity** named `Synthetic Invited Client` using the owner setup
guide. Obtain inbox access privately; there is no initial password to share.
Do not reuse an already-confirmed login/recovery fixture or use real client data.
Start logged out in a fresh InPrivate/Incognito window. No Docker, AI tool,
Supabase CLI or privileged credentials are needed by Ahmed.

### Manual checks

| ID | Exact action | Expected result / PASS criteria |
| --- | --- | --- |
| A1 | Open `/portal` while logged out. | Ahmed's login/account-request UI remains, with non-clickable first-time guidance to use the invitation email. Create account submits a pending access request, not a Supabase signup, approval or invitation. No public Auth signup or invitation resend is introduced. |
| A2 | Check the new synthetic inbox/spam folder after Hélio issues the invitation. | A separate EmailJS invitation template arrives for the correct recipient, linking to local account setup. No password or session token is in the email. |
| A3 | Before verifying any invitation, ask Hélio to explicitly resend. Use the newest email for the remaining checks; try the earlier link in a separate fresh private session and click Continue. | Resend does not change profile approval. The earlier replaced proof fails with generic invalid/expired feedback; no first-password form is granted. Respect provider email cooldowns when retrying. |
| A4 | Open the newest invitation in the fresh private window. Reload/open it again before Continue. | The URL becomes `/portal/activate` with no proof in the address bar. Continue appears; GET/reload does not consume the proof. |
| A5 | Click Continue. Open `/portal` in another tab of that private window, then return to `/portal/activate` and refresh. | First-password form appears after verification, but `/portal` still shows login. Refresh preserves setup. Owner-approved profile remains active; verification does not approve/change profiles. |
| A6 | Try a short/common password or mismatched confirmation, then correct it. | Validation rejects invalid input without reporting successful setup; a corrected password can still be submitted using the current setup session. |
| A7 | Choose and confirm a new synthetic password following the displayed rules, then click Set password. | Setup returns to login, not the dashboard. Fresh email/password login succeeds and shows Welcome, Synthetic Invited Client. Record the new credential privately. Logout still works. |
| A8 | In a fresh private session, open the used invitation again and click Continue. Try a malformed link. Separately leave a new unused synthetic invitation beyond the provider's configured expiry (Hélio confirms the interval), then try it. | Used/invalid/expired links fail generically with no usable password form or portal access. Guidance says contact the team; no public resend or self-approval is offered. |
| A9 | Ask Hélio to run the owner resend operation for the now-confirmed account. | The tool refuses reinvitation and does not alter credentials/profile approval. If setup was interrupted after email verification, existing password recovery is the recovery path. |

Report A1–A9 PASS/FAIL, Dev commit, browser/version and sanitized screenshots/error
output for failures. Never share invitation/recovery links, passwords or cookies.
Email arrival and owner provisioning are manual prerequisites, not implied by
passing the offline suite. Run the existing login/logout and recovery sections
as regression checks when testing the newly deployed shared hook.

## Client Portal Create account / access request

### Prerequisites

Complete [shared Dev setup](shared-dev.md), including the scoped server-only
submission secret, and start `npm run dev`. Use a fresh logged-out private window
at `http://localhost:3000/portal`. Use synthetic data only: a new unique address
such as `qa-access-<unique suffix>@taxtrax.example.invalid`, name `Synthetic QA
Requester`, phone `+44 7700 900123`, optional company `Synthetic QA Company`.
No deliverable inbox, password, invitation template, Docker or AI tool is needed.
Owner record inspection is private in **Dev** SQL Editor; never select Production.

| ID | Action | Expected result / PASS criteria |
| --- | --- | --- |
| C1 | Click Create account; fill name/email, then Continue. | Ahmed's existing two-step form/layout works; no password is collected. |
| C2 | Fill phone/company but leave consent unchecked and submit. | Consent feedback appears; no success or stored request. |
| C3 | Check consent and submit once. | Request received appears. Network POST is `/api/portal/access-requests`, not `/api/contact`, with `contact_consent: true`; response is generic `{ "ok": true }` with no ID/session. |
| C4 | Ask Hélio to inspect the matching Dev request. | One row: trimmed name/phone/company, lowercase email, consent true, status pending and generated ID/timestamp. Blank company is stored as null. No Auth user/client_profile/invitation was created. |
| C5 | Return to login/Create account and resubmit the same address, optionally uppercase and with changed name/company. | Same generic success, still one pending row; original data is not replaced. |
| C6 | Submit using an existing synthetic Dev login email; ask Hélio to inspect matching Dev requests. | Same generic success, but no new pending access-request row is created. Existing Auth user/profile/login state is not changed or disclosed. Repeat with an Auth-only synthetic identity if available: the same rule applies without a profile. Pre-existing request rows are not deleted or changed. |
| C7 | Open `/portal` again after submission. | Login remains; submitting a request does not grant portal access. Existing login/logout and recovery still work. |
| C8 | Submit invalid email/phone or incomplete required fields; check desktop and narrow/mobile widths. | Clear validation feedback, no false success; design remains intact. More than five boundary-valid attempts in ten minutes may return generic throttling; wait before retrying. |

Report C1–C8 PASS/FAIL, commit/browser/version and sanitized failures/screenshots.
Never share scoped secrets or real personal data. Owner/admin review and approval
now have a backend API; the desktop review UI remains unimplemented. Invitation
email delivery acceptance remains separately dependent on Ahmed's EmailJS configuration.

## Admin Client Portal access-request review (backend only)

Complete owner review setup in [shared-dev.md](shared-dev.md), restart the app,
and obtain the local website admin key privately. There is **no desktop review
UI yet**. Use PowerShell/API calls below; API details and retry states are in
[admin-access-requests.md](admin-access-requests.md). Use synthetic data only.
Prepare separate new requests for approval and rejection through Create account.
Use a privately supplied deliverable synthetic inbox only for the invitation
delivery check; never reuse an already activated account for initial approval.

```powershell
$secureKey = Read-Host "Local Dev website admin key" -AsSecureString
$headers = @{ 'x-admin-key' = [System.Net.NetworkCredential]::new('', $secureKey).Password }
$base = 'http://localhost:3000/api/admin/accessrequests'
Invoke-RestMethod -Uri $base -Headers $headers
$id = '<synthetic request UUID from the list>'
Invoke-RestMethod -Uri "$base`?id=$id" -Headers $headers
$body = @{ id = $id; action = 'approve' } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri $base -Method Patch -Headers $headers -ContentType 'application/json' -Body $body
```

| ID | Action | Expected result / PASS criteria |
| --- | --- | --- |
| R1 | GET list/details with valid key; repeat without/wrong key. | At most 50 pending requests, oldest first; correct detail. Unauthorized calls return 401, without data. Responses are no-store. |
| R2 | Approve the new synthetic request using PATCH. Refresh its detail. | Approved decision/time; one marked unconfirmed Auth identity and active profile before invitation. Provisioning ready; invitation outcome recorded separately. No password/proof/link in API response. |
| R3 | Repeat approve on R2. | Same account/profile/decision; no additional invitation. A timeout/503 requires detail inspection before retry, not an assumption of rollback. |
| R4 | On a different pending request, change `$id` and `$body` action to `reject`; repeat reject, then try approve. | Rejected once/time stable; no Auth/profile/email. Repeated reject succeeds; approve returns 409. Public resubmission stays generic and does not reopen it. |
| R5 | For an approved unconfirmed request with failed/unknown delivery, inspect its state, wait at least 60 seconds, then PATCH `resend_invite`. | Same user/profile; new invitation attempt/outcome. Immediate/concurrent resend returns 409. Approval/profile remain even if email fails. No automatic retry on uncertain delivery. |
| R6 | When Ahmed's invitation template is configured, inspect the synthetic inbox and perform existing A3–A8 activation/login tests. Afterwards try explicit resend. | Invitation arrives and existing activation/first-password/fresh-login works. Confirmed account refuses resend with 409; approval/profile are unchanged. **Real email delivery acceptance is deferred until that configuration is ready**, not implied by automated tests. |
| R7 | Send malformed UUID, unknown action or extra `status`/`email` body fields; also send approved→reject or rejected→approve. | Invalid input returns 400/no action; conflicting decisions return 409/no transition. |

Provisioning interruption, concurrent approve/reject and unrelated-account
takeover protection are covered by the focused shared-Dev suite; do not force
failures/reset data or modify real accounts manually. Report R1–R7 PASS/FAIL,
commit/browser/API tool and sanitized failures; never include keys, links or
real personal data. Afterwards `Remove-Variable headers,secureKey` to discard
the local test credential references.

## Safe automated checks

In a second terminal, from `website`, run:

```bash
npm run test:supabase-foundation
npm run test:supabase-shared-dev
npm run test:recovery
npm run test:activation
npm run test:access-requests
npm run test:admin-access-requests
npx tsc --noEmit
git diff --check
```

PASS means all six test suites finish with no failures, TypeScript reports no
errors, and `git diff --check` reports no whitespace errors. These commands do
not reset or seed the shared database and do not replace the manual checks.

Hélio can also run `npm run test:recovery:shared-dev` with authenticated, Dev-linked
CLI access and Playwright Chromium. It tests real proof/password changes, browser
isolation, RLS and login/logout using only uniquely named disposable fixtures.
It does not send email or reset the database and is not required for Ahmed's QA.

Hélio can similarly run `npm run test:activation:shared-dev` with Dev provisioning
access. It uses disposable synthetic identities, tests real invite
proofs/cookie isolation/RLS/first-password login, does not send email, and never
resets the database. This owner-only suite is not required for Ahmed's manual QA.
With Playwright Chromium installed, `npm run test:activation:ui` additionally
checks the real Next.js UI/callback and provider-unavailable behavior offline;
it needs neither Docker nor privileged Dev access and sends no email.

Hélio can run `npm run test:access-requests:shared-dev` after owner setup. It uses
marked, disposable synthetic requests/identities to test real pending storage,
duplicates, ordinary-client access denial and the existing UI. It sends no emails
and never resets shared data. CLI/Management access is owner-only, not Ahmed's QA.

The older `test:portal`, `test:auth-handlers`, `test:session` and `test:authz`
suites remain tied to the previous local Docker/Supabase test infrastructure.
They are **not part of Ahmed's shared-Dev workflow** unless later migrated.
Do not retarget them at shared Dev or bypass their local safeguards.
