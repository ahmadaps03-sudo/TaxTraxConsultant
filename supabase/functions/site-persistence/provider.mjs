export function siteProvider(url, serviceKey, transport = fetch) {
  const call = async (path, init) => {
    let endpoint;
    try {
      endpoint = new URL(url);
    } catch { throw new Error("Site persistence unavailable."); }
    const local = endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
    const hosted = endpoint.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(endpoint.hostname);
    if ((!local && !hosted) || endpoint.origin !== url || !serviceKey) throw new Error("Site persistence unavailable.");
    const response = await transport(`${url}/rest/v1/${path}`, {
      ...init, redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) throw new Error("Site persistence unavailable.");
    return response;
  };
  return {
    async rateLimit(hash, max, windowSeconds) {
      const response = await call("rpc/site_take_rate_limit", { method: "POST", body: JSON.stringify({ p_hash: hash, p_max: max, p_window_seconds: windowSeconds }) });
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0].ok !== "boolean" || !Number.isInteger(rows[0].retry_after)) throw new Error();
      return { ok: rows[0].ok, retryAfter: rows[0].retry_after };
    },
    async add(collection, data) {
      const response = await call("site_records?select=id,created_at,data", { method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ id: crypto.randomUUID(), collection, data }) });
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length !== 1) throw new Error();
      return { ...rows[0].data, id: rows[0].id, createdAt: new Date(rows[0].created_at).toISOString() };
    },
    async list(collection) {
      const result = [];
      for (let offset = 0; ; offset += 1000) {
        const response = await call(`site_records?collection=eq.${collection}&select=id,created_at,data&order=created_at.desc,id.desc&limit=1000&offset=${offset}`, { method: "GET" });
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error();
        result.push(...rows.map(row => ({ ...row.data, id: row.id, createdAt: new Date(row.created_at).toISOString() })));
        if (rows.length < 1000) return result;
      }
    },
    async pageView(view) {
      await call("site_page_views", { method: "POST", body: JSON.stringify(view) });
    },
  };
}
