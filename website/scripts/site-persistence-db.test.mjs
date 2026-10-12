import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

const container = `taxtrax-site-test-${randomUUID().slice(0, 8)}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sql = (source) => {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { encoding: "utf8", input: source });
  if (result.status !== 0) throw new Error(`Local SQL assertion failed: ${result.stderr.split("\n").find(line => line.includes("ERROR:")) ?? "psql error"}`);
  return result.stdout.trim();
};

test("local disposable Postgres enforces site grants, RLS, validation and atomic rate limits", { timeout: 120000 }, async () => {
  docker("run", "--rm", "-d", "--name", container, "-e", "POSTGRES_PASSWORD=synthetic_test_password", "postgres:17-alpine");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { sql("select 1;"); ready = true; break; } catch { await pause(200); }
    }
    assert.ok(ready, "Disposable Postgres did not start");
    sql("create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; create schema private;");
    const migration = await readFile(new URL("../../supabase/migrations/20261013000100_site_persistence_foundation.sql", import.meta.url), "utf8");
    sql(migration);

    sql(`insert into public.site_records(id,collection,data,created_at) values
      ('seed-post','posts','{"slug":"synthetic","published":true}'::jsonb,'2026-10-12T12:00:00Z'),
      ('draft-post','posts','{"slug":"synthetic-draft","published":false}'::jsonb,'2026-10-12T12:00:00Z'),
      ('private-message','messages','{"name":"Synthetic"}'::jsonb,'2026-10-12T12:00:00Z'),
      ('private-booking','bookings','{"email":"synthetic@example.invalid"}'::jsonb,'2026-10-12T12:00:00Z'),
      ('private-lead','leads','{"email":"synthetic@example.invalid"}'::jsonb,'2026-10-12T12:00:00Z');`);
    assert.equal(sql("set role anon; select string_agg(id,',') from public.site_records; reset role;"), "seed-post");
    assert.equal(sql("set role authenticated; select string_agg(id,',') from public.site_records; reset role;"), "seed-post");
    assert.equal(sql("select has_table_privilege('anon','public.site_records','INSERT') or has_table_privilege('authenticated','public.site_records','UPDATE') or has_table_privilege('authenticated','public.site_records','DELETE');"), "f");
    assert.equal(sql("select has_table_privilege('anon','public.site_page_views','SELECT') or has_table_privilege('authenticated','public.site_page_views','INSERT');"), "f");
    assert.equal(sql("select has_function_privilege('anon','public.site_take_rate_limit(text,integer,integer)','EXECUTE');"), "f");
    assert.equal(sql("select id,created_at from public.site_records where id='seed-post';"), "seed-post|2026-10-12 12:00:00+00");
    sql("set role service_role; insert into public.site_records(id,collection,data) values('server-only','messages','{\"name\":\"Synthetic\"}'); reset role;");
    assert.equal(sql("select count(*) from public.site_records where id='server-only';"), "1");
    assert.equal(sql("select has_table_privilege('service_role','private.site_rate_limits','SELECT');"), "f");
    const invalidCollection = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: "insert into public.site_records(id,collection,data) values('wrong-domain','client_profiles','{}');", encoding: "utf8" });
    assert.notEqual(invalidCollection.status, 0);
    assert.notEqual(spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: "set role anon; insert into public.site_records(id,collection,data) values('forged','posts','{}');", encoding: "utf8" }).status, 0);

    sql(`insert into public.site_page_views(ts,day,path,country,visitor,referrer,device)
      values ('2020-10-12T12:00:00Z','2020-10-12','/about','GB','0123456789abcdef',null,'desktop');`);
    assert.equal(sql("select count(*) from public.site_page_views;"), "1");
    const invalidView = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
      { input: "insert into public.site_page_views(ts,day,path,country,visitor,device) values('2026-10-12T12:00:00Z','2026-10-11','/about','GB','raw-ip','desktop');", encoding: "utf8" });
    assert.notEqual(invalidView.status, 0);

    const call = (hash, max, window) => `set role service_role; select ok,retry_after from public.site_take_rate_limit(repeat('${hash}',64),${max},${window});`;
    const results = await Promise.all(Array.from({ length: 20 }, async () => sql(call("a", 5, 600)).split("\n").at(-1)));
    assert.equal(results.filter(result => result === "t|0").length, 5);
    assert.equal(results.filter(result => /^f\|[1-9]\d*$/.test(result)).length, 15);
    assert.equal(sql(call("b", 1, 4)).split("\n").at(-1), "t|0");
    assert.match(sql(call("b", 1, 4)).split("\n").at(-1), /^f\|[1-4]$/);
    await pause(4200);
    assert.equal(sql(call("b", 1, 4)).split("\n").at(-1), "t|0");
    for (const input of [`repeat('x',64),0,600`, `repeat('x',64),5,0`, `'raw-ip',5,600`]) {
      const invalid = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
        { input: `set role service_role; select * from public.site_take_rate_limit(${input});`, encoding: "utf8" });
      assert.notEqual(invalid.status, 0);
    }
    sql("set role service_role; select public.site_prune_telemetry();");
    assert.equal(sql("select count(*) from public.site_page_views;"), "0");
  } finally { docker("stop", container); }
});
