# TaxTrax Consulting — Frontend

## Local Supabase foundation — checkpoints 1–2

Supabase is the approved Client Portal backend direction. The reproducible local
stack, compatible pinned tooling, safe environment helper, and setup instructions
are in [docs/local-supabase.md](docs/local-supabase.md). Start with `npm ci`,
`npm run supabase:start`, and `npm run supabase:env` using the existing `.nvmrc`.
Checkpoint 3 adds [client profiles, RLS and synthetic local fixtures](docs/client-profile-authorization.md).
Checkpoint 4 adds [server session integration](docs/server-session-integration.md),
including portal-only refresh middleware and a server authorization helper.
Checkpoint 5 adds [backend login/logout handlers](docs/auth-handlers.md).
Checkpoint 6 connects the existing portal UI to the server authentication boundary;
see [portal integration and browser tests](docs/portal-auth-integration.md).
Login/logout is functional for synthetic local accounts. Other dashboard data
and controls remain mock/unimplemented; do not introduce sensitive client data.
Existing SQLite/filesystem features remain unchanged; the older backend-phase
suggestions later in this README are historical, not the current architecture decision.

Full frontend for TaxTrax Consulting, built to the attached `Website_Format.pdf` spec, in your
black/crimson brand identity instead of the mockup's navy/gold. Contact, booking and calculator-lead forms now post to `/api/*` (JSON-file store in
`lib/store.ts`) and are managed from the separate desktop app in `../admin-app`. See `../README.md`
for setup. Other content still lives in `lib/data.ts`.

## If `npm run dev` fails with an SWC error on Windows

This is almost always caused by the project folder living inside a OneDrive-synced directory
(Desktop/Documents/Downloads are backed up by OneDrive on most default Windows 11 setups), which
corrupts the native `.node` binary Next.js needs mid-write. Fix: copy the project to a plain local
path like `C:\dev\tax-website` (not under OneDrive), delete `node_modules` + `package-lock.json`,
run `npm cache clean --force`, then `npm install` again. A `.nvmrc` and an `engines` field are
included pinning Node to `18.18–20.x`, since that's the range Next.js 14 is actually built and
tested against — newer Node majors aren't guaranteed to have prebuilt native binaries yet.

**Do not run `npm audit fix --force`.** It will silently jump Next.js to a new major version (14 →
16 has happened during this build) which changes how dynamic route params work, among other
breaking changes, and this codebase is written and tested against Next 14 patterns. The one
remaining `npm audit` finding after installing from this package.json is a PostCSS advisory
bundled *inside Next 14's own internal build tooling* — it only processes trusted local CSS at
build time (never visitor input), so it's not a real risk for this project, and it only fully
clears by adopting Next 15/16 deliberately later, with the codebase updated for their breaking
changes first.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. `npm run build` produces a production build (Google Fonts require
network access, so the build must run somewhere with normal internet — it will not build inside a
fully offline sandbox).

## Project structure

```
app/
  layout.tsx              Root layout — fonts, i18n provider, nav/footer chrome
  page.tsx                Home
  services/page.tsx       Filterable services grid
  tools/
    page.tsx              Tools hub
    salary-tax-calculator/         Working FBR-style slab calculator
    sales-tax-calculator/          Inclusive/exclusive GST calculator
    business-tax-estimator/        Sole prop / AOP / Pvt Ltd estimator
    wht-calculator/                Withholding tax by transaction type
    filer-status-checker/          Guidance tool → links to FBR Iris
  blog/
    page.tsx               Post list + category filter
    [slug]/page.tsx         Individual post
  resources/page.tsx       Embedded video grid
  about/page.tsx           Team credentials
  contact/page.tsx         Contact form
  book-consultation/page.tsx   4-step booking flow
  portal/page.tsx          Client Portal — server-authorized login/dashboard boundary
  admin/page.tsx           Admin panel — login + mocked dashboard
components/                Navbar, Footer, ServiceCard, TestimonialCarousel,
                            LeadCaptureModal, ToolShell, LanguageToggle
lib/
  data.ts                 Mock content — shaped to match prisma/schema.prisma 1:1
  i18n.tsx                EN/UR dictionary + context (RTL switch included)
prisma/
  schema.prisma           Reference schema for the backend phase (see below)
```

## Rebrand — light theme, Befiler-inspired homepage (latest revision)

The site moved from the original dark black/red theme to a light theme per the client's updated
direction: white background, `#2D2D2D` dark-grey body text, `#FF0404` primary red. This was a
low-risk change because every page uses shared Tailwind color *tokens* (`bg-ink`, `text-paper`,
`bg-charcoal`, `border-line`, `bg-signal`, etc.) rather than one-off hex classes — repointing the
tokens in `tailwind.config.ts` re-themed nearly the whole site at once. The footer and the closing
CTA band deliberately opted out, using dedicated `night`/`mist` tokens, so there's still a dark
contrast band for grounding (a common, trustworthy pattern — see Befiler's own dark footer).

**What changed:**
- Full color repoint — see `tailwind.config.ts` for the token → hex mapping.
- Cards upgraded from flat/square to rounded + subtly shadowed (`.card-flat` in `globals.css`),
  for a more polished, "designed" feel per the "avoid AI-generic, make it graphical" direction.
- Homepage rebuilt with Befiler's actual information architecture (fetched and reviewed live,
  not guessed): split hero with a custom SVG illustration (no stock photography — original vector
  art, so there's nothing to license or attribute), generic trust badges, a "How it works" 4-step
  section, a "Why choose us" section, and 3-tier pricing cards.
- A floating WhatsApp widget (`components/WhatsAppWidget.tsx`) now appears on every page,
  bottom-right, with a pulse animation. **Replace the placeholder number** at the top of that file
  with the real WhatsApp Business number before launch.
- **FBR / RAAST removed from the generic hero trust badges** — those are Pakistan-specific
  regulators/payment rails and this site now serves an international, multi-jurisdiction audience.
  They're still referenced correctly inside the Pakistan-specific service cards, the WHT/Salary
  calculators, and relevant blog posts, since that content genuinely is FBR-related.
- **Deliberately not replicated**: Befiler's "Our Partners & Collaborators" and bank-integration
  logo strips (real logos for Engro, UBL, HBL, AWS, etc.). Displaying real company logos as
  "partners" without an actual partnership would misrepresent business relationships that don't
  exist. If TaxTrax has real partners/integrations, send logos + permission and that section is a
  quick add.

## Hero & nav — light band on the dark site

The home hero and the site navbar now match the client-approved reference screenshot: a warm
cream (`#FBF6F5`) band with centered copy, a red "2026 Tax Season" pill, rounded pill CTAs
("Start Filing Now" + a working "Chat on WhatsApp" `wa.me` link), and a white shadowed card with
four trust badges (Secure & Encrypted, Expert Consultants, FBR Compliant, RAAST Secure Payment).
The navbar is light throughout the site with dropdown menus under Tax Tools / Services / Resources
sourced live from `lib/data.ts`, plus a segmented English/اردو pill, a "Sign In" pill (→ Client
Portal), and a solid "File Tax" pill (→ booking flow). Everything below the hero — services,
tools hub, case studies, testimonials, team, and every other page — stays on the dark ink/charcoal
theme from the original brand brief; only the hero band and the sticky nav are light, by design,
to match the reference.

## Design system

- **Palette**: ink `#0D0D0D`, charcoal `#1A1A1A`, crimson `#8B0000` (brand mark, borders), signal
  red `#E63946` (CTAs), ember `#C1121F` (hover), paper `#F5F5F5` (text), smoke `#A0A0A0` (muted),
  ok green `#2E7D32` (success/verified), line `#2E2E2E` (all borders/dividers).
- **Type**: Source Serif 4 for headings (gives the "official document" authority a tax firm
  needs), IBM Plex Sans for body/UI (clean tabular numerals for money figures), Noto Nastaliq Urdu
  for `dir="rtl"` content.
- **Layout language**: flat bordered "ledger" cards — no drop shadows, no rounded corners — plus a
  recurring crimson margin rule (`.ledger-rule`) standing in for a tax-form's ruled margin. This is
  a deliberate departure from the generic SaaS card-with-shadow kit.
- All interactive elements have a visible focus ring (`.focus-ring`) and `prefers-reduced-motion`
  is respected globally.

## i18n / RTL

`lib/i18n.tsx` provides a `useI18n()` hook (`t(key)`, `lang`, `setLang`) and flips
`<html dir>` between `ltr`/`rtl`. Navigation, hero, footer disclaimer and CTA strings are fully
translated as a working example. **Blog posts, case studies and other long-form CMS content are
English-only for now** — once the backend exists, translate by adding a `lang` column (see
`SiteSetting.lang` in the schema) rather than hardcoding a second copy of each page.

## Calculators

All five tools compute client-side using illustrative FBR-style slabs/rates hardcoded in each
page (clearly commented `TODO(backend)` — these belong in an admin-editable rate table so Support
staff can update them each Finance Act without a redeploy). Every calculator:

1. Shows results inline.
2. Offers "Unlock PDF report & WhatsApp copy" → `LeadCaptureModal`.
3. **WhatsApp send already works** — it's a `wa.me` deep link, no backend needed.
4. **PDF download is a placeholder** (`.txt` blob) — swap for a real branded PDF once you have an
   API route (Puppeteer rendering an HTML template, or a service like PDFKit/react-pdf) that the
   modal can POST to.

The Filer Status Checker is intentionally honest about its limits: FBR's Iris portal isn't
CORS-open, so live ATL verification needs a backend proxy. Right now it opens the official checker
in a new tab and offers a "have a specialist confirm" lead-capture path instead of faking a result.

## What's stubbed vs. real

| Feature | Status |
|---|---|
| All page layouts, nav, filters, forms | Real, functional UI |
| Salary / Sales Tax / Business / WHT calculators | Real math, illustrative rates |
| WhatsApp send from calculators | Real (`wa.me` link) |
| PDF report download | Placeholder text file |
| Contact form, booking flow, lead capture | UI + client state only — no persistence |
| Client Portal & Admin login | UI only — any input "logs in" (no real auth yet) |
| Client Portal dashboard (documents, checklist, billing) | Static mock data |
| Admin dashboard (messages, bookings, CRUD managers) | Static mock data; non-listed managers show a placeholder panel |
| Blog / Resources / Services / Team content | Hardcoded in `lib/data.ts` |

## Backend phase — what to build next

1. **Database**: Postgres via **Neon** (recommended — see reasoning at the top of
   `prisma/schema.prisma`; Supabase is an equally fine alternative if you want built-in
   auth/storage from the same vendor).
2. **ORM**: Prisma — `prisma/schema.prisma` already models every entity this frontend expects
   (`Service`, `Post`, `Booking`, `Client`, `Document`, `Message`, `SiteSetting`, etc.).
3. **Auth**: NextAuth.js with a Credentials provider for both the client portal and admin
   (`Role` enum already in the schema for Super Admin / Editor / Support). Add a `twoFactorSecret`
   field + TOTP check at login once you're ready for 2FA — the spec's login screens already leave
   room for it.
4. **File storage**: **Vercel Blob** for documents/images (simplest, same-vendor billing);
   **Cloudinary** if you want on-the-fly video/image transforms. Vercel's own filesystem is
   ephemeral per invocation — anything uploaded must go to Blob/Cloudinary/S3, never `/public` or
   a local disk path, or it disappears on the next deploy/cold start.
5. **Serverless considerations for Vercel**:
   - No long-running processes — PDF generation via Puppeteer works but keep it under the function
     timeout (10s Hobby / 60s+ Pro); consider a queue (e.g. Vercel Cron + a lightweight worker) if
     reports get complex.
   - WebSockets/long polling (e.g. live chat) aren't supported on standard serverless functions —
     use a third-party (Pusher, Ably) or Vercel's Edge/streaming APIs if you add live messaging.
   - Every `TODO(backend)` comment in the codebase marks the exact API route to add.

## Still need your input before backend work starts

- **Payment gateway** (for paid strategy calls / portal invoicing): Stripe is the default
  recommendation for USD/international cards; for PKR-native payments you'll likely also want a
  local gateway (e.g. HBL/JazzCash/Easypaisa) alongside it.
- **Calendar tool**: Calendly/SavvyCal (fastest to ship, embeds directly) vs. a custom
  slots-in-Postgres system (more control, more build time, no per-seat SaaS fee).
- **Hosting budget**: affects whether Blob/Cloudinary free tiers are enough, and whether Neon's
  free tier or a paid plan is right for expected document volume.
