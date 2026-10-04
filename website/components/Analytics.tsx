"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Sends one anonymous page-view per navigation. Respects Do Not Track. */
export default function Analytics() {
  const path = usePathname();
  useEffect(() => {
    if (navigator.doNotTrack === "1" || path.startsWith("/portal")) return;
    const body = JSON.stringify({ path, ref: document.referrer });
    try { if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "text/plain" }))) throw 0; }
    catch { fetch("/api/track", { method: "POST", body, keepalive: true }).catch(() => {}); }
  }, [path]);
  return null;
}
