# Site persistence foundation (Slice 1)

This slice adds PostgreSQL schema and a scoped Edge capability for the website's
legacy site collections, page-view events and shared rate limits. Shared Dev has
the Slice 1 migrations and Edge Function. Local data has not been copied to
shared Dev.

`public.site_records` keeps the existing `id`, `createdAt` and collection data
shape. Only published posts/videos are readable with a public Supabase session;
messages, bookings, leads, page views and limiter counters are not. The existing
`client_access_requests`, `client_profiles` and portal tables remain separate.

Website-server integration requires `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, `SITE_INGEST_SECRET` and
`SITE_ADMIN_DATA_SECRET`. The two scoped secrets must be distinct, generated
privately and also configured on the `site-persistence` Edge Function. Only the
Edge Function receives Supabase's service-role credential. The existing
`ADMIN_API_KEY` remains the desktop admin authentication boundary; its route
must check the admin key before calling the admin-scoped helper.

`site_take_rate_limit` performs one atomic upsert per hashed key and window.
Callers must await it and fail closed if persistence is unavailable. The
`site_prune_telemetry` service-only RPC removes page views older than 90 days
and stale limiter counters. Schedule it before moving analytics traffic; this
slice does not install a production scheduler or migrate historical views.

Shared Dev grants/RLS and the database integration tests were verified before
the site-collection cutover. Never place service-role credentials in the website
environment.

`npm run test:site-persistence` runs offline Edge/helper boundary tests.
`npm run test:site-persistence:db` additionally needs Docker and runs an
isolated, disposable local Postgres container. Neither command contacts a
Supabase cloud project or modifies the developer's local Supabase data.

## Slice 2 admin CRUD prerequisite

The forward-only migration, `20261013000300_site_record_admin_mutations.sql`,
adds service-only atomic update/delete RPCs. The revised `site-persistence`
Edge Function exposes these operations only through `SITE_ADMIN_DATA_SECRET`;
its ingest capability cannot list, update or delete records. Website/Admin
site-collection routes now use the scoped Supabase capability.

This migration and revised `site-persistence` function are deployed to **Dev**
with the existing `SITE_INGEST_SECRET` and `SITE_ADMIN_DATA_SECRET`.
The owner can run
`node scripts/site-persistence-synthetic-dev.mjs seed` from `website/` to create
only marked synthetic Dev records; `status` inspects their count and `cleanup`
removes only those marked records. The script requires the approved Dev URL,
publishable key and scoped admin capability in untracked `.env.local`. Do not
copy local SQLite records to Dev: existing local submissions may contain
personal data and remain in the local database as a read-only reference.

## Slice 2 site-collection cutover

Contact messages, bookings, leads, posts and video metadata now read/write
through Supabase. The Admin collection endpoints and response shapes remain
unchanged. Public content reads use the unprivileged publishable key; only
records with `published: true` are visible. Portal appointments are matched to
the validated client's email on the server. No SQLite fallback or dual-write
is used for these collections.

The Slice 3 code moves site video files to a separate private `site-videos`
Storage bucket; it is **not deployed to shared Dev yet**. The Electron main
process obtains a scoped signed upload URL through the existing admin-key
website API, uploads directly to Storage, then creates the video metadata.
The maximum supported upload is **50 MB** (MP4, WebM or MOV). The renderer
never receives the scoped capability or service-role key. Existing
`/api/media/<file>` links remain valid after rollout: only published metadata
can obtain a 60-second signed Storage playback URL. Unpublishing blocks new
links immediately; an already-issued signed URL can remain usable for up to
60 seconds. Drafts and missing-published records are not public.

Video deletion first hides metadata, then removes the Storage object, then
deletes metadata. If cleanup fails, the hidden record remains retryable.
Failed uploads attempt immediate object cleanup. Abandoned uploads are
eligible for owner-only cleanup after three hours (the upload permission
expires sooner). Run `node scripts/site-video-orphans-dev.mjs status` to audit
or `node scripts/site-video-orphans-dev.mjs cleanup` to remove eligible
unreferenced objects in the approved Dev project only. Do not put credentials
or signed URLs into logs. Existing local media files are not imported.

Before Dev use, the owner must review/apply
`20261014000100_site_video_storage.sql` and redeploy `site-persistence` to
**Dev only**, retaining the existing scoped secrets. Confirm the bucket is
private, its file-size/MIME restrictions and restrictive object policy are
effective, and the project-wide Storage file-size setting permits 50 MB.
Check that existing Dev video metadata has no local-only file references,
then perform a synthetic upload, published/draft playback, Range request,
delete and orphan audit. No new secret is required. This is not a Production
rollout.

The local SQLite records were intentionally **not** imported to shared Dev, so
those records no longer appear in the shared Dev website/Admin views. Keep the
local database as a rollback/reference source; do not delete it. Media files,
page views, rate limits and the Admin client count now use Supabase. This is
not a Production deployment.

`npm run test:site-cutover` checks route contracts and portal booking isolation
without writing to shared Dev.

## Slice 4 analytics and distributed limits (deployed in Dev)

The Slice 4 code writes page views through the existing ingest-scoped Edge
capability and reads aggregate-only results through the admin-scoped
`site_analytics_aggregate` RPC. The forward-only migration
`20261015000100_site_analytics_aggregate.sql` and the revised
`site-persistence` Edge Function are deployed in Dev with the existing scoped
secrets. Admin summary now counts active `client_profiles`, not legacy
SQLite users. Existing chart/API response shapes remain unchanged; the 18
local demo/history views are not imported.

Contact, booking, lead, tracking, access-request, recovery and authenticated
portal mutation limits use the existing atomic Postgres fixed-window limiter.
Tracking keeps its 204 beacon response and suppresses writes on outage;
mutations fail closed. IP identity comes only from `X-Forwarded-For` when
`TRUST_PROXY=1` behind a proxy that **overwrites** that header. Otherwise the
shared `unknown` bucket is deliberately conservative. Visitor IDs are daily
HMACs; use a private 32+ character `ANALYTICS_SALT` or the existing private
`SITE_INGEST_SECRET`. Raw IP addresses are not persisted.

The existing service-only `site_prune_telemetry` RPC deletes views older than
90 days and stale limiter buckets. After Dev rollout, the owner can run
`node scripts/site-prune-telemetry-dev.mjs` from `website/`. A trusted daily
schedule is required before Vercel staging; this slice does not install one.
Do not run this command against Production or copy local demo views to Dev.
