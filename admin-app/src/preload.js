const { contextBridge, ipcRenderer } = require("electron");
const call = (path, method, body) => ipcRenderer.invoke("api:request", { path, method, body });

contextBridge.exposeInMainWorld("admin", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  connect: (serverUrl, key) => ipcRenderer.invoke("auth:connect", { serverUrl, key }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  get: (c) => call(`/api/admin/${c}`),
  create: (c, body) => call(`/api/admin/${c}`, "POST", body),
  patch: (c, body) => call(`/api/admin/${c}`, "PATCH", body),
  remove: (c, id) => call(`/api/admin/${c}?id=${encodeURIComponent(id)}`, "DELETE"),
  pickVideo: () => ipcRenderer.invoke("video:pick"),
  uploadVideo: (meta) => ipcRenderer.invoke("video:upload", meta),
});
