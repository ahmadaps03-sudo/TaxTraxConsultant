// Calls Supabase with the service-role key, from inside the Edge Function only.
export function portalProvider(url, key, transport = fetch) {
  const call = (route, body) => {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url ?? "") && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url ?? "") || !key) throw new Error("Client portal admin unavailable.");
    return transport(`${url}${route}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  };
  return {
    async rpc(action, payload) {
      const result = await call("/rest/v1/rpc/admin_portal", { p_action: action, p_payload: payload });
      if (!result.ok) throw new Error("Client portal admin unavailable.");
      return result.json();
    },
    // 5-minute link to a private client file; staff open it in the browser.
    async signedUrl(objectPath) {
      if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/.test(objectPath ?? "")) throw new Error();
      const result = await call(`/storage/v1/object/sign/client-documents/${objectPath}`, { expiresIn: 300 });
      if (!result.ok) throw new Error("Client portal admin unavailable.");
      const body = await result.json();
      if (typeof body.signedURL !== "string") throw new Error();
      return `${url}/storage/v1${body.signedURL.startsWith("/") ? "" : "/"}${body.signedURL}`;
    },
  };
}
