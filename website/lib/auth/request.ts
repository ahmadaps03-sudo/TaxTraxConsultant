import "server-only";

export class AuthRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AuthRequestError";
  }
}

const maximumBodyBytes = 4096;
const controlCharacters = /[\u0000-\u001f\u007f-\u009f]/u;

export async function readAuthRequest(request: Request): Promise<Record<string, unknown>> {
  const configured = process.env.AUTH_ORIGIN;
  try {
    const origin = new URL(configured ?? "");
    const local = origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((!local && origin.protocol !== "https:") || origin.username || origin.password || origin.origin !== configured) throw new Error();
  } catch {
    throw new AuthRequestError(503, "Authentication is temporarily unavailable. Please try again.");
  }
  if (request.method !== "POST") throw new AuthRequestError(405, "Method not allowed.");
  if (request.headers.get("origin") !== configured || request.headers.get("x-taxtrax-auth") !== "1") {
    throw new AuthRequestError(403, "Request not allowed.");
  }
  const site = request.headers.get("sec-fetch-site");
  const mode = request.headers.get("sec-fetch-mode");
  const destination = request.headers.get("sec-fetch-dest");
  if ((site !== null && site !== "same-origin") || (mode !== null && !["cors", "same-origin"].includes(mode)) || (destination !== null && destination !== "empty")) {
    throw new AuthRequestError(403, "Request not allowed.");
  }
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get("content-type") ?? "")) {
    throw new AuthRequestError(415, "JSON content type required.");
  }
  const length = request.headers.get("content-length");
  if (length !== null && !/^\d+$/.test(length)) throw new AuthRequestError(400, "Invalid request.");
  if (length !== null && Number(length) > maximumBodyBytes) throw new AuthRequestError(413, "Request too large.");
  if (!request.body) throw new AuthRequestError(400, "Invalid request.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = Date.now() + 5000;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new AuthRequestError(408, "Request timed out.")), Math.max(0, deadline - Date.now()));
        }),
      ]).finally(() => clearTimeout(timer));
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBodyBytes) throw new AuthRequestError(413, "Request too large.");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error instanceof AuthRequestError ? error : new AuthRequestError(400, "Invalid request.");
  } finally {
    reader.releaseLock();
  }
}

export function loginCredentials(body: Record<string, unknown>) {
  if (Object.keys(body).length !== 2 || !Object.hasOwn(body, "email") || !Object.hasOwn(body, "password")) throw new AuthRequestError(400, "Invalid request.");
  if (typeof body.email !== "string" || controlCharacters.test(body.email)) throw new AuthRequestError(400, "Invalid request.");
  const email = body.email.trim().toLowerCase();
  const [local, domain] = email.split("@");
  if (email.length > 254 || !local || local.length > 64 || !/^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/i.test(local)
    || !domain || email.split("@").length !== 2 || domain.split(".").length < 2
    || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) throw new AuthRequestError(400, "Invalid request.");
  if (typeof body.password !== "string" || !body.password.length || new TextEncoder().encode(body.password).byteLength > 1024) throw new AuthRequestError(400, "Invalid request.");
  return { email, password: body.password };
}
