const { app, BrowserWindow, ipcMain, safeStorage, shell, Menu, dialog } = require("electron");
const { Readable } = require("stream");
const path = require("path");
const fs = require("fs");

// ---- settings (server URL + admin key), key encrypted with the OS keychain when available ----
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsFile(), "utf8"));
    let key = "";
    if (raw.key) key = raw.enc ? safeStorage.decryptString(Buffer.from(raw.key, "base64")) : raw.key;
    return { serverUrl: raw.serverUrl || "", key };
  } catch {
    return { serverUrl: "", key: "" };
  }
}

function saveSettings({ serverUrl, key }) {
  const enc = safeStorage.isEncryptionAvailable();
  const stored = { serverUrl, enc, key: key ? (enc ? safeStorage.encryptString(key).toString("base64") : key) : "" };
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(stored), { mode: 0o600 });
}

function normalizeServerUrl(input) {
  let u;
  try { u = new URL(String(input).trim()); } catch { throw new Error("Enter a valid URL, e.g. https://taxtraxconsulting.com"); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
    throw new Error("Use https:// (plain http is only allowed for localhost).");
  }
  return u.origin;
}

// ---- API bridge: renderer never sees the key or makes network calls itself ----
async function apiRequest({ path: p, method = "GET", body }) {
  const { serverUrl, key } = loadSettings();
  if (!serverUrl || !key) throw new Error("Not connected");
  if (!/^\/api\/admin\/[a-z]+(\?id=[A-Za-z0-9-]{1,80})?$/.test(p) || !["GET", "POST", "PATCH", "DELETE"].includes(method)) throw new Error("Blocked request");
  const res = await fetch(serverUrl + p, {
    method,
    headers: { "x-admin-key": key, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Server responded ${res.status}`);
  return json.data;
}

ipcMain.handle("settings:get", () => {
  const s = loadSettings();
  return { serverUrl: s.serverUrl, connected: !!(s.serverUrl && s.key) };
});

ipcMain.handle("auth:connect", async (_e, { serverUrl, key }) => {
  const url = normalizeServerUrl(serverUrl);
  if (!key || key.length < 16) throw new Error("Admin key must be at least 16 characters.");
  const prev = loadSettings();
  saveSettings({ serverUrl: url, key });
  try {
    await apiRequest({ path: "/api/admin/summary" }); // verifies URL + key together
  } catch (err) {
    saveSettings(prev); // roll back so a bad attempt doesn't stick
    throw err;
  }
  return true;
});

ipcMain.handle("auth:logout", () => { saveSettings({ serverUrl: loadSettings().serverUrl, key: "" }); return true; });
ipcMain.handle("api:request", (_e, req) => apiRequest(req));

// ---- video upload: the file path stays in the main process, the renderer can't pick arbitrary paths ----
let picked = null;
ipcMain.handle("video:pick", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Video (MP4, WebM, MOV)", extensions: ["mp4", "webm", "mov"] }] });
  if (r.canceled) return null;
  picked = r.filePaths[0];
  return { name: path.basename(picked), size: fs.statSync(picked).size };
});

ipcMain.handle("video:upload", async (_e, { title, category, description }) => {
  if (!picked) throw new Error("Choose a video file first.");
  const { serverUrl, key } = loadSettings();
  if (!serverUrl || !key) throw new Error("Not connected");
  const type = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" }[path.extname(picked).slice(1).toLowerCase()];
  if (!type) throw new Error("Unsupported video type.");
  const size = fs.statSync(picked).size;
  if (size > 500 * 1024 * 1024) throw new Error("Video is larger than 500 MB.");
  const up = await fetch(serverUrl + "/api/admin/upload", {
    method: "POST",
    headers: { "x-admin-key": key, "content-type": type, "content-length": String(size) },
    body: Readable.toWeb(fs.createReadStream(picked)),
    duplex: "half",
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const j = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(j.error || `Upload failed (${up.status})`);
  const row = await apiRequest({ path: "/api/admin/videos", method: "POST", body: { kind: "file", file: j.data.file, title, category, description, published: true } });
  picked = null;
  return row;
});

// ---- window ----
function createWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 780, minWidth: 900, minHeight: 600,
    backgroundColor: "#F4F5F7", title: "TaxTrax Admin",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Never navigate away from the app shell; open any link in the system browser.
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); return { action: "deny" }; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } });
  app.whenReady().then(() => {
    if (app.isPackaged) Menu.setApplicationMenu(null);
    createWindow();
    app.on("activate", () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
}
