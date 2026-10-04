/* Server data is untrusted (it comes from public forms), so the UI is built with textContent only. */
const $app = document.getElementById("app");
const ICONS = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>', mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>', users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.500 3-6 7-6s7 2.500 7 6M17 5a3.500 3.500 0 0 1 0 7M22 20c0-2.500-1.500-4.500-4-5.500"/>',
  pen: '<path d="M4 20l1-5L16 4l4 4L9 19zM14 6l4 4"/>', video: '<rect x="3" y="5" width="13" height="14" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>', out: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9"/>',
  play: '<path d="M8 5v14l11-7z"/>', plus: '<path d="M12 5v14M5 12h14"/>', refresh: '<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const icon = (n, size) => { const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ic"); if (size) { s.setAttribute("width", size); s.setAttribute("height", size); } s.innerHTML = ICONS[n]; return s; }; // constants only
const NAV = [["Overview", [["Dashboard", "home"]]], ["Inbox", [["Messages", "mail"], ["Bookings", "cal"], ["Leads", "users"]]], ["Content", [["Blog Manager", "pen"], ["Video Manager", "video"]]]];
const NEED = { Dashboard: ["summary", "analytics", "messages", "bookings"], Messages: ["summary", "messages"], Bookings: ["summary", "bookings"], Leads: ["summary", "leads"], "Blog Manager": ["summary", "posts"], "Video Manager": ["summary", "videos"] };
const SERVICES = { "income-tax-return-fbr": "Income Tax Return (FBR)", "sales-tax-registration": "Sales Tax Registration", "company-registration-secp": "Company Registration (SECP)", "usa-llc-tax-filing": "USA LLC & Tax Filing", "uk-ltd-registration": "UK Ltd Registration", "uae-vat-corporate-tax": "UAE VAT & Corporate Tax" };
const S = { view: "Dashboard", loading: true, d: {}, error: "", timer: null, msgFilter: "all", q: "", bookFilter: "all", editor: null, videoForm: null, host: "", modals: 0 };

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v; else if (k === "style") el.style.cssText = v; // CSSOM is allowed by the CSP; setAttribute("style") is not
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (k === "value") el.value = v; else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const NS = "http://www.w3.org/2000/svg";
function sv(tag, attrs = {}, ...kids) { const el = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(String(k))); return el; }
const clean = (e) => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; if (m < 1440) return Math.round(m / 60) + "h ago"; if (m < 43200) return Math.round(m / 1440) + "d ago"; return new Date(iso).toLocaleDateString(); };
const num = (n) => Number(n || 0).toLocaleString();
const mount = (n) => $app.replaceChildren(n);
let REGION; try { REGION = new Intl.DisplayNames(["en"], { type: "region" }); } catch { /* old runtime */ }
const countryName = (c) => (c === "ZZ" ? "Unknown" : (REGION && (() => { try { return REGION.of(c); } catch { return c; } })()) || c);

function toast(msg, bad) { let b = document.getElementById("toasts"); if (!b) { b = h("div", { id: "toasts", "aria-live": "polite" }); document.body.append(b); } const t = h("div", { class: "toast" + (bad ? " err" : "") }, msg); b.append(t); setTimeout(() => t.remove(), 3500); }

/* ---------- popup windows ---------- */
function showModal({ title, body, footer }) {
  const close = () => { document.removeEventListener("keydown", onKey); bg.remove(); S.modals--; };
  const onKey = (e) => e.key === "Escape" && close();
  const bg = h("div", { class: "modal-bg", role: "dialog", "aria-modal": "true", onmousedown: (e) => e.target === bg && close() },
    h("div", { class: "card modal" }, h("div", { class: "mh" }, h("h2", {}, title), h("button", { class: "mx", "aria-label": "Close", onclick: close }, icon("x", 16))), h("div", { class: "mb" }, body), footer ? h("div", { class: "mf" }, footer(close)) : null));
  document.addEventListener("keydown", onKey); document.body.append(bg); S.modals++; return close;
}
const confirmBox = (title, text) => new Promise((res) => {
  const close = showModal({ title, body: h("p", { class: "muted", style: "font-size:14px" }, text), footer: (c) => [h("button", { class: "btn ghost", onclick: () => { c(); res(false); } }, "Cancel"), h("button", { class: "btn danger", onclick: () => { c(); res(true); } }, "Delete")] });
  void close;
});
const kv = (pairs) => h("dl", { class: "kv" }, pairs.filter(([, v]) => v).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]));
const digits = (p) => String(p || "").replace(/\D/g, "");

/* ---------- login ---------- */
function showLogin(pref = "") {
  clearInterval(S.timer);
  const url = h("input", { type: "url", required: true, placeholder: "https://taxtraxconsulting.com", value: pref });
  const key = h("input", { type: "password", required: true, autocomplete: "off", placeholder: "ADMIN_API_KEY from the server" });
  const err = h("p", { class: "err", role: "alert" }); const btn = h("button", { class: "btn", type: "submit" }, "Connect");
  mount(h("div", { class: "center" }, h("form", { class: "card login", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ""; btn.disabled = true; btn.textContent = "Connecting…";
    try { await window.admin.connect(url.value, key.value); await start(); } catch (ex) { err.textContent = clean(ex); btn.disabled = false; btn.textContent = "Connect"; }
  } }, h("div", { class: "brand" }, h("i"), "TaxTrax Admin"), h("p", { class: "muted" }, "Staff access only."), h("label", {}, "Website URL", url), h("label", {}, "Admin key", key), err, btn,
    h("p", { class: "hint" }, "Use http://localhost:3000 while testing. The key is stored encrypted by your operating system."))));
}

/* ---------- data (loads only what the current page needs) ---------- */
async function load(silent) {
  if (!silent) { S.loading = true; render(); }
  try { const keys = NEED[S.view]; const res = await Promise.all(keys.map((k) => window.admin.get(k))); keys.forEach((k, i) => (S.d[k] = res[i])); S.error = ""; } catch (ex) { S.error = clean(ex); }
  S.loading = false; render();
}
async function start() { S.host = (await window.admin.getSettings()).serverUrl; await load(); clearInterval(S.timer); S.timer = setInterval(() => { if (!S.modals && !S.editor && !S.videoForm) load(true); }, 30000); }
const go = (v) => { Object.assign(S, { view: v, editor: null, videoForm: null }); load(); };

/* ---------- shell ---------- */
function render() {
  const sm = S.d.summary || {}; const counts = { Messages: sm.unreadMessages, Bookings: sm.pendingBookings };
  const side = h("aside", {}, h("div", { class: "brand" }, h("i"), h("span", {}, "TaxTrax Admin")),
    NAV.map(([g, items]) => [h("div", { class: "group" }, g), items.map(([n, ic]) => h("button", { class: "nav" + (n === S.view ? " active" : ""), onclick: () => go(n) }, icon(ic), h("span", { class: "t" }, n), counts[n] ? h("span", { class: "badge" }, counts[n]) : null))]),
    h("div", { class: "spacer" }), h("div", { class: "host" }, S.host), h("button", { class: "nav logout", onclick: async () => { await window.admin.logout(); showLogin(S.host); } }, icon("out"), h("span", { class: "t" }, "Log out")));
  const body = h("div", {});
  if (S.error) body.append(h("div", { class: "card alert" }, h("p", { class: "err", role: "alert", style: "margin:0" }, "Could not reach the server: " + S.error)));
  body.append(...(S.loading ? [1, 2, 3].map(() => h("div", { class: "sk" })) : [view()]));
  mount(h("div", { class: "shell" }, side, h("main", {}, h("div", { class: "top" }, h("h1", {}, S.view), h("div", { class: "actions" }, h("button", { class: "btn ghost sm", onclick: () => load() }, icon("refresh"), "Refresh"))), h("div", { class: "content" }, body))));
}
const empty = (t, d) => h("div", { class: "card empty" }, h("b", {}, t), d);
const chips = (opts, cur, set) => h("div", { class: "chips" }, opts.map(([v, l]) => h("button", { class: "chip" + (cur === v ? " on" : ""), onclick: () => set(v) }, l)));
function view() {
  return { Dashboard: dashboard, Messages: messages, Bookings: bookings, Leads: leads, "Blog Manager": () => (S.editor ? postEditor() : blog()), "Video Manager": videos }[S.view]();
}

/* ---------- charts (plain SVG, no libraries) ---------- */
function lineChart(rows) {
  const W = 680, H = 230, L = 38, B = 24, T = 10, R = 8, n = rows.length, max = Math.max(5, ...rows.map((r) => r.views)), nice = Math.ceil(max / 4) * 4;
  const x = (i) => L + (i * (W - L - R)) / (n - 1), y = (v) => T + (H - T - B) * (1 - v / nice);
  const path = (k) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Page views and visitors per day" });
  for (let g = 0; g <= 4; g++) { const v = (nice / 4) * g, yy = y(v); svg.append(sv("line", { x1: L, x2: W - R, y1: yy, y2: yy, stroke: "#E4E6EB" }), sv("text", { x: L - 6, y: yy + 3, "text-anchor": "end" }, num(Math.round(v)))); }
  rows.forEach((r, i) => { if (i % 5 === 0 || i === n - 1) svg.append(sv("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, new Date(r.day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))); });
  svg.append(sv("path", { d: `${path("views")} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`, fill: "rgba(227,0,15,.10)" }), sv("path", { d: path("views"), fill: "none", stroke: "#E3000F", "stroke-width": 2.2, "stroke-linejoin": "round" }), sv("path", { d: path("visitors"), fill: "none", stroke: "#1F2933", "stroke-width": 2, "stroke-dasharray": "4 3" }));
  rows.forEach((r, i) => svg.append(sv("rect", { x: x(i) - (W - L - R) / (n - 1) / 2, y: T, width: (W - L - R) / (n - 1), height: H - T - B, fill: "transparent" }, sv("title", {}, `${new Date(r.day + "T00:00:00").toLocaleDateString(undefined, { dateStyle: "medium" })}: ${num(r.views)} views, ${num(r.visitors)} visitors`))));
  return svg;
}
function stackChart(rows) {
  const W = 680, H = 190, L = 30, B = 22, T = 8, n = rows.length, tot = (r) => r.bookings + r.messages + r.leads, max = Math.max(3, ...rows.map(tot)), bw = (W - L - 6) / n;
  const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Bookings, messages and leads per day" });
  for (let g = 0; g <= 3; g++) { const v = Math.round((max / 3) * g), yy = T + (H - T - B) * (1 - g / 3); svg.append(sv("line", { x1: L, x2: W, y1: yy, y2: yy, stroke: "#E4E6EB" }), sv("text", { x: L - 6, y: yy + 3, "text-anchor": "end" }, v)); }
  rows.forEach((r, i) => { let yy = H - B; const x = L + i * bw + 2;
    for (const [k, c] of [["bookings", "#E3000F"], ["messages", "#1F2933"], ["leads", "#B8BEC8"]]) { const hh = ((H - T - B) * r[k]) / max; if (hh) { yy -= hh; svg.append(sv("rect", { x, y: yy, width: Math.max(2, bw - 4), height: hh, fill: c, rx: 2 })); } }
    svg.append(sv("rect", { x: L + i * bw, y: T, width: bw, height: H - T - B, fill: "transparent" }, sv("title", {}, `${r.day}: ${r.bookings} bookings, ${r.messages} messages, ${r.leads} leads`)));
    if (i % 5 === 0 || i === n - 1) svg.append(sv("text", { x: x + bw / 2, y: H - 6, "text-anchor": "middle" }, new Date(r.day + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }))); });
  return svg;
}
const barList = (items, labelFn, valueKey, suffix = "") => { const max = Math.max(1, ...items.map((i) => i[valueKey])), total = items.reduce((a, i) => a + i[valueKey], 0) || 1;
  return h("div", { class: "bars" }, items.map((it) => h("div", { class: "bar" }, h("div", { class: "top" }, h("span", {}, labelFn(it)), h("b", {}, `${num(it[valueKey])}${suffix} · ${Math.round((it[valueKey] / total) * 100)}%`)), h("div", { class: "track" }, h("div", { class: "fill", style: `width:${(it[valueKey] / max) * 100}%` }))))); };
const legend = (items) => h("div", { class: "legend" }, items.map(([c, l]) => h("span", {}, h("i", { style: `background:${c}` }), l)));

/* ---------- dashboard ---------- */
function dashboard() {
  const sm = S.d.summary || {}, a = S.d.analytics, t = a?.totals || {};
  const stat = (l, v, sub, to) => h("div", { class: "card stat", role: to ? "button" : null, tabindex: to ? "0" : null, onclick: to ? () => go(to) : null }, h("div", {}, h("b", {}, v), h("span", {}, l), sub ? h("span", { style: "display:block;margin-top:2px" }, sub) : null));
  const noData = !t.views;
  const root = h("div", {}, h("div", { class: "grid" },
    stat("Unread messages", num(sm.unreadMessages), "", "Messages"), stat("Pending bookings", num(sm.pendingBookings), "", "Bookings"),
    stat("Visitors, 30 days", num(t.visitors), `${num(t.views)} page views`), stat("Bookings, 30 days", num(t.bookings), `${((t.conversion || 0) * 100).toFixed(1)}% of visitors`), stat("Enquiries, 30 days", num((t.messages || 0) + (t.leads || 0)), `${num(t.messages)} messages · ${num(t.leads)} leads`)));
  if (!a) return root;
  root.append(h("div", { class: "card chart-card full" }, h("h2", {}, "Website traffic", h("span", {}, "Last 30 days")), lineChart(a.byDay), legend([["#E3000F", "Page views"], ["#1F2933", "Visitors"]]),
    noData ? h("p", { class: "note" }, "No visits recorded yet. They appear as soon as people open the website. For demo charts run: node scripts/seed-demo-analytics.mjs (in the website folder).") : null));
  root.append(h("div", { class: "grid3" },
    h("div", { class: "card chart-card" }, h("h2", {}, "Visitors by country", h("span", {}, "Top 10")), a.countries.length ? barList(a.countries, (c) => [h("span", { class: "cc" }, c.country === "ZZ" ? "—" : c.country), countryName(c.country)], "visitors") : h("p", { class: "muted" }, "No data yet."),
      a.countries.some((c) => c.country === "ZZ") ? h("p", { class: "note" }, "“Unknown” means the visitor's country could not be detected. It always shows this on localhost; on a live site it comes from your host/CDN or the bundled GeoIP database.") : null),
    h("div", { class: "card chart-card" }, h("h2", {}, "Bookings by service", h("span", {}, "Sales activity")), a.bookingsByService.length ? barList(a.bookingsByService, (b) => SERVICES[b.service] || b.service, "bookings") : h("p", { class: "muted" }, "No bookings in the last 30 days."))));
  root.append(h("div", { class: "card chart-card full" }, h("h2", {}, "Bookings, messages and leads", h("span", {}, "Per day")), stackChart(a.byDay), legend([["#E3000F", "Bookings"], ["#1F2933", "Messages"], ["#B8BEC8", "Leads"]])));
  const list = (rows, l, r) => h("ul", { class: "mini" }, rows.length ? rows.map((x) => h("li", {}, h("span", {}, l(x)), h("b", {}, r(x)))) : h("li", {}, h("span", { class: "muted" }, "No data yet")));
  root.append(h("div", { class: "grid3" }, h("div", { class: "card chart-card" }, h("h2", {}, "Top pages"), list(a.pages, (p) => p.path, (p) => num(p.views))),
    h("div", { class: "card chart-card" }, h("h2", {}, "Traffic sources"), list(a.referrers, (r) => r.referrer, (r) => num(r.views)), h("h2", { style: "margin-top:16px" }, "Devices"), list(a.devices, (d) => d.device[0].toUpperCase() + d.device.slice(1), (d) => num(d.visitors))),
    h("div", { class: "card chart-card" }, h("h2", {}, "Latest messages"), list((S.d.messages || []).slice(0, 6), (m) => m.name + ": " + (m.subject || m.message), (m) => ago(m.createdAt)))));
  return root;
}

/* ---------- messages + bookings (click a row to open details) ---------- */
function messages() {
  const q = S.q.toLowerCase(), all = S.d.messages || [];
  const rows = all.filter((m) => (S.msgFilter === "all" || !m.read) && (!q || `${m.name} ${m.email} ${m.phone} ${m.subject} ${m.message}`.toLowerCase().includes(q)));
  const search = h("input", { class: "search", type: "search", placeholder: "Search messages…", value: S.q, oninput: (e) => { S.q = e.target.value; const p = e.target.selectionStart; render(); const el = document.querySelector(".search"); el.focus(); el.setSelectionRange(p, p); } });
  return h("div", {}, h("div", { class: "actions", style: "margin-bottom:12px;justify-content:space-between" }, chips([["all", "All"], ["unread", "Unread"]], S.msgFilter, (v) => { S.msgFilter = v; render(); }), search),
    rows.length ? h("div", { class: "card list" }, h("div", { class: "thead cols-msg" }, h("span", {}, "Name"), h("span", {}, "Subject"), h("span", {}, "Phone"), h("span", {}, "Received")),
      rows.map((m) => h("div", { class: "trow cols-msg" + (m.read ? "" : " unread"), tabindex: "0", role: "button", onclick: () => openMessage(m), onkeydown: (e) => e.key === "Enter" && openMessage(m) },
        h("span", { class: "c nm" }, m.name), h("span", { class: "c" }, m.subject || m.service || m.message), h("span", { class: "c" }, m.phone || "—"), h("span", { class: "c muted" }, ago(m.createdAt))))) : empty("No messages", S.q ? "Nothing matches your search." : "Messages from the website contact form appear here."));
}
async function setRead(m, read) { try { await window.admin.patch("messages", { id: m.id, read }); m.read = read; const s = S.d.summary; if (s) s.unreadMessages = (S.d.messages || []).filter((x) => !x.read).length; render(); } catch (e) { toast(clean(e), true); } }
function openMessage(m) {
  if (!m.read) setRead(m, true);
  showModal({ title: "Message", body: [kv([["Name", m.name], ["Phone", m.phone ? h("a", { href: `tel:${m.phone}` }, m.phone) : "Not provided"], ["Email", h("a", { href: `mailto:${m.email}` }, m.email)], ["Subject", m.subject || m.service], ["Received", new Date(m.createdAt).toLocaleString()]]), h("div", { class: "msg-body" }, m.message)],
    footer: (close) => [h("button", { class: "btn danger", onclick: async () => { if (await confirmBox("Delete this message?", "This cannot be undone.")) { try { await window.admin.remove("messages", m.id); close(); toast("Deleted"); load(true); } catch (e) { toast(clean(e), true); } } } }, "Delete"),
      h("button", { class: "btn ghost", onclick: async () => { await setRead(m, !m.read); close(); } }, m.read ? "Mark unread" : "Mark read"),
      digits(m.phone) ? h("a", { class: "btn ghost", target: "_blank", href: `https://wa.me/${digits(m.phone)}` }, "WhatsApp") : null,
      h("a", { class: "btn", target: "_blank", href: `mailto:${m.email}?subject=${encodeURIComponent("Re: " + (m.subject || "your TaxTrax enquiry"))}` }, icon("mail"), "Reply by email")] });
}
function bookings() {
  const rows = (S.d.bookings || []).filter((b) => S.bookFilter === "all" || b.status === S.bookFilter);
  return h("div", {}, h("div", { style: "margin-bottom:12px" }, chips([["all", "All"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["done", "Done"], ["cancelled", "Cancelled"]], S.bookFilter, (v) => { S.bookFilter = v; render(); })),
    rows.length ? h("div", { class: "card list" }, h("div", { class: "thead cols-bk" }, h("span", {}, "Name"), h("span", {}, "Service"), h("span", {}, "Date & time"), h("span", {}, "Phone"), h("span", {}, "Status")),
      rows.map((b) => h("div", { class: "trow cols-bk", tabindex: "0", role: "button", onclick: () => openBooking(b), onkeydown: (e) => e.key === "Enter" && openBooking(b) },
        h("span", { class: "c nm" }, b.name), h("span", { class: "c" }, SERVICES[b.service] || b.service || "Consultation"), h("span", { class: "c" }, `${b.date} ${b.time}`), h("span", { class: "c" }, b.phone || "—"), h("span", {}, h("span", { class: "pill " + b.status }, b.status))))) : empty("No bookings", "Bookings made on the website appear here."));
}
function openBooking(b) {
  const sel = h("select", { class: "inline", "aria-label": "Status", onchange: async () => { try { await window.admin.patch("bookings", { id: b.id, status: sel.value }); b.status = sel.value; if (S.d.summary) S.d.summary.pendingBookings = (S.d.bookings || []).filter((x) => x.status === "pending").length; toast("Booking " + sel.value); render(); } catch (e) { toast(clean(e), true); sel.value = b.status; } } },
    ["pending", "confirmed", "done", "cancelled"].map((s) => h("option", { value: s, selected: s === b.status }, s)));
  showModal({ title: "Booking details", body: kv([["Name", b.name], ["Phone", b.phone ? h("a", { href: `tel:${b.phone}` }, b.phone) : "Not provided"], ["Email", h("a", { href: `mailto:${b.email}` }, b.email)], ["Service", SERVICES[b.service] || b.service || "Consultation"], ["Date & time", `${b.date} at ${b.time}`], ["Annual revenue", b.revenue], ["Timeline", b.timeline], ["Status", sel], ["Received", new Date(b.createdAt).toLocaleString()]]),
    footer: (close) => [h("button", { class: "btn danger", onclick: async () => { if (await confirmBox("Delete this booking?", "This cannot be undone.")) { try { await window.admin.remove("bookings", b.id); close(); toast("Deleted"); load(true); } catch (e) { toast(clean(e), true); } } } }, "Delete"),
      digits(b.phone) ? h("a", { class: "btn ghost", target: "_blank", href: `https://wa.me/${digits(b.phone)}` }, "WhatsApp") : null,
      h("a", { class: "btn", target: "_blank", href: `mailto:${b.email}?subject=${encodeURIComponent("Your TaxTrax consultation")}` }, icon("mail"), "Email client")] });
}

function leads() {
  const rows = S.d.leads || [];
  const csv = () => { const esc = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
    const t = ["Date,Name,Email,WhatsApp,Report", ...rows.map((l) => [l.createdAt, l.name, l.email, l.whatsapp, l.reportTitle].map(esc).join(","))].join("\n");
    const a = h("a", { href: URL.createObjectURL(new Blob([t], { type: "text/csv" })), download: "taxtrax-leads.csv" }); a.click(); URL.revokeObjectURL(a.href); };
  return h("div", {}, rows.length ? h("p", {}, h("button", { class: "btn ghost sm", onclick: csv }, "Export CSV")) : null,
    rows.length ? h("div", { class: "card list" }, rows.map((l) => h("div", { class: "row", style: "cursor:default" }, h("div", { class: "head" }, h("span", { class: "name" }, l.name), h("span", { class: "muted" }, ago(l.createdAt))), h("div", { class: "sub" }, `${l.email}${l.whatsapp ? " · " + l.whatsapp : ""} · ${l.reportTitle || "Calculator report"}`)))) : empty("No leads yet", "People who download a calculator report appear here."));
}
async function del(col, row, label) { if (!(await confirmBox(`Delete this ${label}?`, "This cannot be undone."))) return false; try { await window.admin.remove(col, row.id); toast("Deleted"); await load(true); return true; } catch (e) { toast(clean(e), true); return false; } }

/* ---------- blog ---------- */
function blog() {
  const rows = S.d.posts || [];
  return h("div", {}, h("p", {}, h("button", { class: "btn", onclick: () => { S.editor = { title: "", category: "General", author: "TaxTrax Team", excerpt: "", content: "", published: true }; render(); } }, icon("plus"), "New post")),
    rows.length ? h("div", { class: "card list" }, rows.map((p) => h("div", { class: "row", tabindex: "0", role: "button", onclick: () => { S.editor = { ...p, content: p.content.join("\n\n") }; render(); } },
      h("div", { class: "head" }, h("span", { class: "name" }, p.title), h("span", { class: "pill " + (p.published ? "live" : "draft") }, p.published ? "live" : "draft")), h("div", { class: "sub" }, `${p.category} · ${p.author} · ${p.date}`)))) : empty("No posts yet", "Click New post to publish your first article."));
}
function postEditor() {
  const e = S.editor, isNew = !e.id, f = (k) => h("input", { value: e[k] ?? "", oninput: (x) => (e[k] = x.target.value) });
  const content = h("textarea", { style: "min-height:260px", oninput: (x) => (e.content = x.target.value) }); content.value = e.content;
  const excerpt = h("textarea", { oninput: (x) => (e.excerpt = x.target.value) }); excerpt.value = e.excerpt;
  const pub = h("input", { type: "checkbox", onchange: (x) => (e.published = x.target.checked) }); pub.checked = e.published !== false;
  const err = h("p", { class: "err", role: "alert" }); const save = h("button", { class: "btn", type: "submit" }, isNew ? "Publish post" : "Save changes");
  return h("form", { class: "card form", onsubmit: async (ev) => { ev.preventDefault(); err.textContent = ""; save.disabled = true;
    const body = { title: e.title, category: e.category, author: e.author, excerpt: e.excerpt, content: e.content, published: e.published !== false, date: e.date };
    try { isNew ? await window.admin.create("posts", body) : await window.admin.patch("posts", { id: e.id, ...body }); toast("Post saved"); S.editor = null; await load(true); } catch (x) { err.textContent = clean(x); save.disabled = false; } } },
    h("h2", {}, isNew ? "New post" : "Edit post"), h("label", {}, "Title", f("title")), h("div", { class: "r2" }, h("label", {}, "Category", f("category")), h("label", {}, "Author", f("author"))),
    h("label", {}, "Short summary (shown in listings and Google)", excerpt), h("label", {}, "Article text (separate paragraphs with a blank line)", content), h("label", { class: "check" }, pub, "Published (untick to save as draft)"), err,
    h("div", { class: "actions", style: "margin-top:14px" }, save, h("button", { class: "btn ghost", type: "button", onclick: () => { S.editor = null; render(); } }, "Cancel"),
      !isNew ? h("button", { class: "btn danger", type: "button", onclick: async () => { if (await del("posts", e, "post")) { S.editor = null; render(); } } }, "Delete") : null));
}

/* ---------- videos ---------- */
function videos() {
  const rows = S.d.videos || [];
  return h("div", {}, h("div", { class: "actions", style: "margin-bottom:14px" }, h("button", { class: "btn", onclick: () => { S.videoForm = "youtube"; render(); } }, icon("plus"), "Add YouTube link"), h("button", { class: "btn ghost", onclick: () => { S.videoForm = "file"; render(); } }, icon("video"), "Upload video file")),
    S.videoForm ? videoForm() : null,
    rows.length ? h("div", { class: "vgrid" }, rows.map((v) => h("div", { class: "card" }, h("div", { class: "vthumb" }, icon("play")), h("div", { style: "font-weight:600" }, v.title), h("div", { class: "muted", style: "margin:4px 0 10px" }, `${v.category} · ${v.kind === "file" ? "Uploaded file" : "YouTube"}`),
      h("div", { class: "actions" }, h("span", { class: "pill " + (v.published ? "live" : "draft") }, v.published ? "live" : "hidden"),
        h("button", { class: "btn ghost sm", onclick: async () => { try { await window.admin.patch("videos", { id: v.id, published: !v.published }); await load(true); } catch (e) { toast(clean(e), true); } } }, v.published ? "Hide" : "Show"), h("button", { class: "btn danger sm", onclick: () => del("videos", v, "video") }, "Delete"))))) : (S.videoForm ? null : empty("No videos yet", "Add a YouTube link or upload an MP4 to show it on the Resources page.")));
}
function videoForm() {
  const file = S.videoForm === "file", m = { title: "", category: "General", link: "", description: "" }; let picked = null;
  const inp = (k, ph) => h("input", { placeholder: ph || "", oninput: (x) => (m[k] = x.target.value), value: m[k] });
  const err = h("p", { class: "err", role: "alert" }); const go2 = h("button", { class: "btn", type: "submit" }, file ? "Upload & publish" : "Add video"); const pickLbl = h("span", { class: "muted" }, "No file chosen");
  return h("form", { class: "card form", style: "margin-bottom:16px", onsubmit: async (ev) => { ev.preventDefault(); err.textContent = ""; if (file && !picked) { err.textContent = "Choose a video file first."; return; }
    go2.disabled = true; go2.textContent = file ? "Uploading… keep the app open" : "Adding…";
    try { file ? await window.admin.uploadVideo({ title: m.title, category: m.category, description: m.description }) : await window.admin.create("videos", { kind: "youtube", youtube: m.link, title: m.title, category: m.category, description: m.description, published: true }); toast("Video published"); S.videoForm = null; await load(true); }
    catch (x) { err.textContent = clean(x); go2.disabled = false; go2.textContent = file ? "Upload & publish" : "Add video"; } } },
    h("h2", {}, file ? "Upload a video file" : "Add a YouTube video"), h("label", {}, "Title", inp("title")),
    h("div", { class: "r2" }, h("label", {}, "Category", inp("category")), file ? h("label", {}, "Video file (MP4, WebM, MOV, up to 500 MB)", h("div", { class: "actions", style: "margin-top:6px" }, h("button", { class: "btn ghost sm", type: "button", onclick: async () => { const r = await window.admin.pickVideo(); if (r) { picked = r; pickLbl.textContent = `${r.name} (${(r.size / 1048576).toFixed(1)} MB)`; } } }, "Choose file…"), pickLbl)) : h("label", {}, "YouTube link", inp("link", "https://www.youtube.com/watch?v=…"))),
    h("label", {}, "Description (optional)", inp("description")), err, h("div", { class: "actions", style: "margin-top:14px" }, go2, h("button", { class: "btn ghost", type: "button", onclick: () => { S.videoForm = null; render(); } }, "Cancel")));
}

(async () => { const s = await window.admin.getSettings(); if (s.connected) { try { await start(); return; } catch (e) { /* fall through */ } } showLogin(s.serverUrl); })();
