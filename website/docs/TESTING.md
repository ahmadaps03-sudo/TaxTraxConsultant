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
Remember me, activation, password recovery and MFA are not implemented for this
milestone. Other dashboard content is mock data, not functionality under test.

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

## Safe automated checks

In a second terminal, from `website`, run:

```bash
npm run test:supabase-foundation
npm run test:supabase-shared-dev
npx tsc --noEmit
git diff --check
```

PASS means both test suites finish with no failures, TypeScript reports no
errors, and `git diff --check` reports no whitespace errors. These commands do
not reset or seed the shared database and do not replace the manual checks.

The older `test:portal`, `test:auth-handlers`, `test:session` and `test:authz`
suites remain tied to the previous local Docker/Supabase test infrastructure.
They are **not part of Ahmed's shared-Dev workflow** unless later migrated.
Do not retarget them at shared Dev or bypass their local safeguards.
