import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createRequestSupabaseClient } from "./client";
import { setPrivateNoStore } from "./cache";
import { isInvalidProviderIdentity } from "../auth/authorize";

export function isPortalPath(pathname: string) {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

export async function updatePortalSession(request: NextRequest) {
  if (!isPortalPath(request.nextUrl.pathname)) return NextResponse.next();
  let requestClient;
  let unavailable = false;
  try {
    requestClient = createRequestSupabaseClient(request.headers.get("cookie"), () => {});
    const validated = await requestClient.client.auth.getUser();
    if (validated.error) {
      if (isInvalidProviderIdentity(validated.error)) requestClient.state.clear();
      else unavailable = true;
    }
  } catch {
    unavailable = true;
  }
  const forwarded = new Headers(request.headers);
  if (requestClient) {
    const header = requestClient.state.forwardedHeader();
    if (header) forwarded.set("cookie", header);
    else forwarded.delete("cookie");
  }
  const response = unavailable
    ? new NextResponse("Client authentication is temporarily unavailable.", { status: 503 })
    : NextResponse.next({ request: { headers: forwarded } });
  for (const { name, value, options } of requestClient?.state.pendingWrites() ?? []) response.cookies.set(name, value, options);
  setPrivateNoStore(response.headers);
  return response;
}
