import { isIP } from "node:net";

export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY !== "1") return "unknown";
  const address = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return address && isIP(address) ? address : "unknown";
}
