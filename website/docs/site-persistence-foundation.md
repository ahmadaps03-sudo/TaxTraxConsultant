# Site persistence foundation (Slice 1)

This slice adds PostgreSQL schema and a scoped Edge capability for the website's
legacy site collections, page-view events and shared rate limits. It does **not**
switch any existing website or Electron routes away from SQLite, deploy the Edge
Function, apply the migration to shared Dev, or copy local data.

`public.site_records` keeps the existing `id`, `createdAt` and collection data
shape. Only published posts/videos are readable with a public Supabase session;
messages, bookings, leads, page views and limiter counters are not. The existing
`client_access_requests`, `client_profiles` and portal tables remain separate.

Future website-server integration will require `SUPABASE_URL`,
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

Before cutover, confirm the new migration is applied in the intended Dev
project, verify effective grants/RLS there, and run the database integration
tests. Never place service-role credentials in the website environment.

`npm run test:site-persistence` runs offline Edge/helper boundary tests.
`npm run test:site-persistence:db` additionally needs Docker and runs an
isolated, disposable local Postgres container. Neither command contacts a
Supabase cloud project or modifies the developer's local Supabase data.
