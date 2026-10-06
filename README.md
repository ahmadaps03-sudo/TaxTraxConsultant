# TaxTrax: website + desktop admin

```
taxtrax/
  website/     Next.js public site + the API the admin app talks to
  admin-app/   Electron desktop admin panel (Windows / macOS / Linux)
```

The two are fully separate projects. They only meet over HTTP: visitors' forms are saved by the
website, and the desktop app reads them through `/api/admin/*`, protected by a secret key.

## Git workflow
- `main` is the stable, integration-approved branch; normal development should not happen directly on it.
- Ongoing development happens on `dev`.
- Start new work from the current, up-to-date `dev` branch.
- Integrate completed work back into `dev`.
- Merge `dev` into `main` only when the integrated application is tested, stable and approved.

## Requirements
- Node.js 18.18 to 20.x for the website (see `website/.nvmrc`); Node 18+ for the admin app.
- Keep the folder OUT of OneDrive/Dropbox-synced locations (e.g. use `C:\dev\taxtrax`).

## Client Portal on shared Development (no Docker)
Follow [website/docs/shared-dev.md](website/docs/shared-dev.md) for Windows setup,
the unprivileged Dev environment values and the privately shared synthetic login.
Existing SQLite/admin features remain local and separate; Production is not a test target.

## What changed in this version (read first)
- **Database:** the website now stores everything in a real SQLite database (`website/data/taxtrax.db`)
  instead of a JSON file. Run `npm install` again inside `website/` (it adds `better-sqlite3`). Existing
  `data/db.json` content is imported automatically on first start.
- The site's contact details (WhatsApp, address, phone, email, hours) live in `website/lib/contact.ts`,
  and all prices in `website/lib/pricing.ts`. Edit those two files and the whole site updates.
- Tax calculators open as pop-ups; their rates live in `website/lib/tax-calc.ts`.

## Dashboard analytics and speed
- The admin **Dashboard** shows visitors by country, traffic, bookings by service and enquiries. Visits are recorded
  automatically (no IP addresses stored). Country comes from your host/CDN headers or the bundled GeoIP database
  (`geoip-lite`, installed by `npm install`). On `localhost` every visit shows as "Unknown".
- To see the charts filled in right now: `cd website && node scripts/seed-demo-analytics.mjs`
  (remove with `--clear`).
- `npm run dev` compiles each page the first time you open it, so it always feels slow. For real-world speed use
  `npm run build` then `npm start` in `website/`.

## Step 1: Run the website
```bash
cd website
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# also put the owner's WhatsApp number in NEXT_PUBLIC_WHATSAPP_NUMBER (digits only, e.g. 923001234567)
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```
Paste the printed value after `ADMIN_API_KEY=` in `.env.local`, then:
```bash
npm run dev
```
Open http://localhost:3000. (Restart `npm run dev` any time you edit `.env.local`.)

## Step 2: Run the desktop admin app
In a second terminal:
```bash
cd admin-app
npm install        # downloads Electron (~100 MB)
npm start
```
In the window enter `http://localhost:3000` and the same key you put in `.env.local`, then Connect.

## Step 3: Test it end to end
1. On the website open **/contact**, send a message.
2. Open **/book-consultation**, complete all steps and confirm.
3. Open **/tools/salary-tax-calculator**, run a calculation and use the report download (lead form).
   Also open **/services** and check there are no prices, only "Ask pricing" WhatsApp buttons.
4. In the admin app press **Refresh** (or wait 30s): the message appears unread, the booking is
   Pending, and the lead is listed. Click the message to read it (it becomes read), change the
   booking to Confirmed, and try **Export CSV** on Leads.
5. Blog: in the admin app open **Blog Manager → New post**, write a title and text, Publish. Open
   http://localhost:3000/blog: it is live immediately. Edit it, untick "Published" to hide it, delete it.
6. Videos: **Video Manager → Add YouTube link** (paste any YouTube URL) or **Upload video file** (MP4).
   Open http://localhost:3000/resources: it plays there. Hiding or deleting it removes it.
7. Try a wrong key at login. It must be rejected.

Automated check of the website API (with `npm run dev` running):
```bash
cd website
ADMIN_API_KEY=your-key node scripts/smoke-test.mjs        # Windows PowerShell: $env:ADMIN_API_KEY="your-key"; node scripts/smoke-test.mjs
```
It should end with `All checks passed`. It also checks blog, video upload/streaming, sitemap and "no prices on services". Admin app syntax check: `cd admin-app && npm run check`.

## Step 4: Build the installer
```bash
cd admin-app
npm run dist          # output in admin-app/dist/ (.exe on Windows, .dmg on macOS, .AppImage on Linux)
```
Build on the OS you're targeting. Add `build.win.icon` / `build.mac.icon` in `admin-app/package.json`
once you have a square 512x512 icon. The installer is unsigned, so Windows SmartScreen / macOS
Gatekeeper will warn until you buy a code-signing certificate.

## Step 5: Go live
1. Deploy `website/` to a server with a WRITABLE disk (a VPS, Render disk, Railway volume, etc.)
   and set `ADMIN_API_KEY`, `NEXT_PUBLIC_SITE_URL` (and optionally `DATA_FILE` on a persistent
   volume) as environment variables. Use HTTPS.
2. Vercel/Netlify are read-only: replace `website/lib/store.ts` with a database (Postgres +
   Prisma; a `prisma/schema.prisma` starter is already in the project) first.
3. In the desktop app connect to `https://your-domain.com` with the production key.
4. Back up the `data/db.json` file (or your database) regularly.

## Security notes
- The admin key is a single shared secret: anyone holding it has full admin access. Rotate it
  by changing `ADMIN_API_KEY` and reconnecting. Per-staff logins and roles need a real user
  table (next step).
- The key is stored encrypted with the OS keychain (Electron safeStorage); the UI never sees it.
- Public form endpoints validate input and are rate-limited per IP (in memory, per instance).
- `/api/admin/*` refuses to work until `ADMIN_API_KEY` (16+ chars) is set.
- The old `/admin` page was removed from the website, so the admin UI is no longer public.
