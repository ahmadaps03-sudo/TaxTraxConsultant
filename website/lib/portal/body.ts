import "server-only";

export class PortalBodyError extends Error {
  constructor(public status: number) { super("Invalid request."); }
}

export async function boundedBody(request: Request, maximumBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) throw new PortalBodyError(400);
  if (declared !== null && Number(declared) > maximumBytes) throw new PortalBodyError(413);
  if (!request.body) throw new PortalBodyError(400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const deadline = Date.now() + 10_000;
  try {
    while (true) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const part = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PortalBodyError(408)), Math.max(0, deadline - Date.now())); }),
      ]).finally(() => clearTimeout(timer));
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maximumBytes) throw new PortalBodyError(413);
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function boundedJson(request: Request, maximumBytes = 20_000): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(request.headers.get("content-type") ?? "")) throw new PortalBodyError(415);
  const bytes = await boundedBody(request, maximumBytes);
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch { /* malformed JSON */ }
  throw new PortalBodyError(400);
}
