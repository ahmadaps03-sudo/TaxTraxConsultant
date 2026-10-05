import { createServer } from "node:http";

export async function authTestProxy(context) {
  const faults = new Map();
  const sessions = [];
  const requests = [];
  const server = createServer(async (request, response) => {
    try {
      const target = new URL(request.url, context.url);
      if (target.origin !== context.url) throw new Error();
      const pathname = target.pathname;
      requests.push(pathname);
      const fault = faults.get(pathname);
      if (fault === "disconnect") {
        request.socket.destroy();
        return;
      }
      if (typeof fault === "number") {
        response.writeHead(fault, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "Synthetic provider failure", code: fault === 429 ? "over_request_rate_limit" : "unexpected_failure" }));
        return;
      }
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (value && !["host", "connection", "content-length", "transfer-encoding"].includes(name)) headers.set(name, Array.isArray(value) ? value.join(",") : value);
      }
      if (fault === "revoke" && pathname === "/rest/v1/client_profiles") {
        const revoked = await fetch(`${context.url}/auth/v1/logout?scope=local`, { method: "POST", headers: { apikey: context.publishableKey, Authorization: headers.get("authorization") }, redirect: "error" });
        if (!revoked.ok) throw new Error();
      }
      const result = await fetch(target, { method: request.method, headers, body: ["GET", "HEAD"].includes(request.method) ? undefined : Buffer.concat(chunks), redirect: "error", signal: AbortSignal.timeout(15_000) });
      const bytes = Buffer.from(await result.arrayBuffer());
      if (pathname === "/auth/v1/token" && result.ok) {
        const body = JSON.parse(bytes.toString());
        if (body.access_token && body.refresh_token) sessions.push(body);
      }
      const forwardedHeaders = Object.fromEntries([...result.headers].filter(([name]) => !["content-length", "content-encoding", "transfer-encoding", "connection"].includes(name)));
      response.writeHead(result.status, forwardedHeaders);
      response.end(bytes);
    } catch {
      if (!response.headersSent && !response.destroyed) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end('{"message":"Synthetic proxy unavailable"}');
      } else response.destroy();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    sessions,
    requests,
    faults,
    async stop() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}
