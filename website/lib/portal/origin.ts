import "server-only";

export function portalMutationBoundary(request: Request, configured: string | undefined): "allowed" | "denied" | "unavailable" {
  let validConfiguration = false;
  try {
    const origin = new URL(configured ?? "");
    validConfiguration = origin.origin === configured && !origin.username && !origin.password &&
      (origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)));
  } catch { /* invalid configuration */ }
  if (!validConfiguration) return "unavailable";
  const site = request.headers.get("sec-fetch-site");
  const mode = request.headers.get("sec-fetch-mode");
  const destination = request.headers.get("sec-fetch-dest");
  if (request.headers.get("origin") !== configured ||
      (site !== null && site !== "same-origin") ||
      (mode !== null && !["cors", "same-origin"].includes(mode)) ||
      (destination !== null && destination !== "empty") ||
      request.headers.get("x-taxtrax-auth") !== "1") return "denied";
  return "allowed";
}
