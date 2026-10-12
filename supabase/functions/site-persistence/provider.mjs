export function siteProvider(url, serviceKey, transport = fetch) {
  const toRow = row => ({ ...row.data, id: row.id, createdAt: new Date(row.created_at).toISOString() });
  const request = async (root, path, init) => {
    let endpoint;
    try {
      endpoint = new URL(url);
    } catch { throw new Error("Site persistence unavailable."); }
    const local = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    const hosted = endpoint.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname);
    if ((!local && !hosted) || endpoint.origin !== url || !serviceKey) throw new Error("Site persistence unavailable.");
    const response = await transport(`${url}/${root}/${path}`, {
      ...init, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) throw new Error("Site persistence unavailable.");
    return response;
  };
  const call = (path, init) => request("rest/v1", path, init);
  const storage = (path, init) => request("storage/v1", path, init);
  const videoTypes = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" };
  const videoFile = /^[a-f0-9-]{36}\.(mp4|webm|mov)$/;
  const safeSignedUrl = (relative, prefix, file) => {
    if (typeof relative !== "string" || !relative.startsWith(prefix)) throw new Error("Site persistence unavailable.");
    const signed = new URL(`${url}/storage/v1${relative}`);
    if (signed.origin !== url || signed.pathname !== `/storage/v1${prefix}site-videos/${file}` || !signed.searchParams.has("token")) throw new Error("Site persistence unavailable.");
    return signed.toString();
  };
  const videoInfo = async file => {
    const response = await storage(`object/info/site-videos/${file}`, { method: "GET" });
    const info = await response.json();
    const size = Number(info?.size ?? info?.metadata?.size);
    const type = info?.content_type ?? info?.metadata?.mimetype;
    if (!Number.isInteger(size) || size < 1 || size > 50 * 1024 * 1024 || type !== videoTypes[file.split(".").at(-1)]) throw new Error("Site persistence unavailable.");
    return info;
  };
  const removeVideo = async file => {
    await storage("object/site-videos", { method: "DELETE", body: JSON.stringify({ prefixes: [file] }) });
  };
  const provider = {
    async rateLimit(hash, max, windowSeconds) {
      const response = await call("rpc/site_take_rate_limit", { method: "POST", body: JSON.stringify({ p_hash: hash, p_max: max, p_window_seconds: windowSeconds }) });
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].ok !== "boolean" || !Number.isInteger(rows[0].retry_after)) throw new Error();
      return { ok: rows[0].ok, retryAfter: rows[0].retry_after };
    },
    async add(collection, data) {
      const file = collection === "videos" && data.kind === "file" ? data.file : null;
      if (file) {
        if (!videoFile.test(file)) throw new Error("Site persistence unavailable.");
        const existing = (await provider.list("videos")).find(row => row.kind === "file" && row.file === file);
        if (existing) return existing;
        await videoInfo(file);
      }
      try {
        const response = await call("site_records?select=id,created_at,data", { method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ id: crypto.randomUUID(), collection, data }) });
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length !== 1) throw new Error();
        return toRow(rows[0]);
      } catch (error) {
        if (file) {
          const existing = (await provider.list("videos")).find(row => row.kind === "file" && row.file === file);
          if (existing) return existing;
          await provider.cleanupVideoUpload(file);
        }
        throw error;
      }
    },
    async list(collection) {
      const result = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await call(`site_records?collection=eq.${collection}&select=id,created_at,data&order=created_at.desc,id.desc&limit=1000&offset=${offset}`, { method: "GET" });
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error();
        result.push(...rows.map(toRow));
        if (rows.length < 1000) return result;
      }
    },
    async update(collection, id, patch) {
      const response = await call("rpc/site_update_record", { method: "POST",
        body: JSON.stringify({ p_collection: collection, p_id: id, p_patch: patch }) });
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error("Site persistence unavailable.");
      return rows.length ? toRow(rows[0]) : null;
    },
    async remove(collection, id) {
      if (collection === "videos") {
        const existing = (await provider.list("videos")).find(row => row.id === id);
        if (!existing) return null;
        if (existing.kind === "file") {
          if (!videoFile.test(existing.file)) throw new Error("Site persistence unavailable.");
          const hidden = await provider.update("videos", id, { published: false, _deletePending: true });
          if (!hidden) return null;
          await removeVideo(existing.file);
        }
      }
      const response = await call("rpc/site_delete_record", { method: "POST",
        body: JSON.stringify({ p_collection: collection, p_id: id }) });
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length > 1) throw new Error("Site persistence unavailable.");
      return rows.length ? toRow(rows[0]) : null;
    },
    async signVideoUpload(size, contentType) {
      if (!Number.isInteger(size) || size < 1 || size > 50 * 1024 * 1024) throw new Error("Site persistence unavailable.");
      const ext = Object.keys(videoTypes).find(key => videoTypes[key] === contentType);
      if (!ext) throw new Error("Site persistence unavailable.");
      const file = `${crypto.randomUUID()}.${ext}`;
      const response = await storage(`object/upload/sign/site-videos/${file}`, { method: "POST", body: "{}" });
      const result = await response.json();
      return { file, uploadUrl: safeSignedUrl(result?.url, "/object/upload/sign/", file) };
    },
    async cleanupVideoUpload(file) {
      if (!videoFile.test(file)) throw new Error("Site persistence unavailable.");
      if ((await provider.list("videos")).some(row => row.kind === "file" && row.file === file)) throw new Error("Site persistence unavailable.");
      await removeVideo(file);
    },
    async signVideoPlayback(file) {
      if (!videoFile.test(file)) throw new Error("Site persistence unavailable.");
      const visible = (await provider.list("videos")).some(row => row.kind === "file" && row.file === file && row.published === true && row._deletePending !== true);
      if (!visible) return null;
      await videoInfo(file);
      const response = await storage(`object/sign/site-videos/${file}`, { method: "POST", body: JSON.stringify({ expiresIn: 60 }) });
      const result = await response.json();
      return { url: safeSignedUrl(result?.signedURL, "/object/sign/", file) };
    },
    async cleanupVideoOrphans(dryRun) {
      const referenced = new Set((await provider.list("videos")).filter(row => row.kind === "file").map(row => row.file));
      const objects = [];
      for (let offset = 0; offset <= 10000; offset += 1000) {
        const response = await storage("object/list/site-videos", { method: "POST", body: JSON.stringify({ prefix: "", limit: 1000, offset }) });
        const page = await response.json();
        if (!Array.isArray(page)) throw new Error("Site persistence unavailable.");
        objects.push(...page);
        if (page.length < 1000) break;
        if (offset === 10000) throw new Error("Site persistence unavailable.");
      }
      const cutoff = Date.now() - 3 * 60 * 60 * 1000;
      const orphans = objects.filter(object => videoFile.test(object.name) && !referenced.has(object.name)
        && Number.isFinite(Date.parse(object.created_at)) && Date.parse(object.created_at) < cutoff);
      if (!dryRun) for (const object of orphans) await removeVideo(object.name);
      return { eligible: orphans.length, removed: dryRun ? 0 : orphans.length };
    },
    async pageView(view) {
      await call("site_page_views", { method: "POST", body: JSON.stringify(view) });
    },
  };
  return provider;
}
