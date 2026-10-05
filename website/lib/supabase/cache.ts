import "server-only";

export function setPrivateNoStore(headers: Headers) {
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  const vary = headers.get("Vary")?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  if (!vary.some(value => value.toLowerCase() === "cookie")) vary.push("Cookie");
  headers.set("Vary", vary.join(", "));
}
