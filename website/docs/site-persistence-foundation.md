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

Local video files have not moved to Storage. Their existing media endpoint now
requires matching published video metadata before streaming and does not cache
the response, so unpublishing removes direct file access on the next request.

The local SQLite records were intentionally **not** imported to shared Dev, so
those records no longer appear in the shared Dev website/Admin views. Keep the
local database as a rollback/reference source; do not delete it. Media files,
page-view storage, rate limits and the legacy Admin client count still depend
on local SQLite/filesystem infrastructure and are outside this cutover. This is
not yet a Vercel-ready or Production deployment.

`npm run test:site-cutover` checks route contracts and portal booking isolation
without writing to shared Dev.
