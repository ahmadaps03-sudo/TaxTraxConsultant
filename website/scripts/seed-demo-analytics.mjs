// Fills the dashboard with clearly-fake demo traffic so you can see the charts.
//   node scripts/seed-demo-analytics.mjs          add demo data
//   node scripts/seed-demo-analytics.mjs --clear  remove it again
import { createRequire } from "module";
import path from "path";
const require = createRequire(import.meta.url);
const file = process.env.DATABASE_FILE || path.join(process.env.DATA_DIR || "data", "taxtrax.db");
let db;
try { const D = require("better-sqlite3"); db = new D(file); } catch { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); }
try { db.prepare("SELECT 1 FROM page_views LIMIT 1").get(); } catch { console.error("Start the website once (npm run dev) so the database is created, then run this again."); process.exit(1); }
db.prepare("DELETE FROM page_views WHERE visitor LIKE 'demo-%'").run();
if (process.argv.includes("--clear")) { console.log("Demo analytics removed."); process.exit(0); }
const countries = [["PK", 46], ["US", 22], ["GB", 12], ["AE", 10], ["CA", 4], ["SA", 3], ["AU", 2], ["DE", 1]];
const pages = ["/", "/", "/", "/services", "/tools", "/book-consultation", "/contact", "/blog", "/about"];
const devices = ["mobile", "mobile", "desktop", "desktop", "tablet"], refs = [null, null, "google.com", "google.com", "facebook.com", "linkedin.com"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const weighted = () => { let r = Math.random() * 100; for (const [c, w] of countries) { if ((r -= w) < 0) return c; } return "PK"; };
const ins = db.prepare("INSERT INTO page_views (ts, day, path, country, visitor, referrer, device) VALUES (?,?,?,?,?,?,?)");
let n = 0;
for (let d = 29; d >= 0; d--) {
  const date = new Date(Date.now() - d * 86400000), day = date.toISOString().slice(0, 10), visitors = 12 + Math.floor(Math.random() * 30) + (29 - d);
  for (let v = 0; v < visitors; v++) { const id = "demo-" + day + v, c = weighted(), dev = pick(devices), ref = pick(refs);
    for (let p = 0, k = 1 + Math.floor(Math.random() * 4); p < k; p++) { ins.run(new Date(date.getTime() + v * 1000).toISOString(), day, pick(pages), c, id, ref, dev); n++; } }
}
console.log(`Added ${n} demo page views. Remove them any time with: node scripts/seed-demo-analytics.mjs --clear`);
