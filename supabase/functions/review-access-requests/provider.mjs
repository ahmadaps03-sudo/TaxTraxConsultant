const inviteErrorCodes = new Set(["email_exists", "user_already_exists", "over_email_send_rate_limit", "hook_timeout", "hook_payload_invalid", "hook_payload_over_size_limit", "unexpected_failure"]);

export function devReviewProvider(url, key, transport = fetch, origin = globalThis.Deno?.env.get("AUTH_ORIGIN") || globalThis.Deno?.env.get("ACTIVATION_ALLOWED_ORIGINS")) {
  const call = async (route, body) => {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url ?? "") || !key) throw new Error("Review unavailable.");
    return transport(`${url}${route}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  };
  return {
    async rpc(action, id, operation, userId) {
      const compatible = ["list_all", "set_approved", "suspend"].includes(action);
      const route = action === "reject_pending" ? "admin_client_reject_pending" : compatible ? "admin_client_account" : "admin_client_access_request";
      const result = await call(`/rest/v1/rpc/${route}`, { p_action: action, p_id: id ?? null, p_operation: operation ?? null, p_user_id: userId ?? null });
      if (!result.ok) throw new Error("Review unavailable.");
      return result.json();
    },
    async createUser(fields) {
      const result = await call("/auth/v1/admin/users", fields);
      if (!result.ok) throw new Error("Provisioning unavailable.");
      const body = await result.json();
      return body.user ?? body;
    },
    async invite(email) {
      try {
        if (!origin || new URL(origin).origin !== origin || !origin.startsWith("https://") && !/^http:\/\/localhost(?::\d+)?$/.test(origin)) throw new Error("Invitation origin unavailable.");
        const redirect = `${origin}/api/auth/activation/callback`;
        const result = await call(`/auth/v1/invite?redirect_to=${encodeURIComponent(redirect)}`, { email });
        if (!result.ok) {
          let errorCode = "unrecognized";
          try {
            const body = await result.json();
            const candidate = body?.code ?? body?.error_code;
            if (inviteErrorCodes.has(candidate)) errorCode = candidate;
          } catch {}
          try { console.warn(JSON.stringify({ event: "invite_failed", http_status: result.status, error_code: errorCode })); } catch {}
          return { outcome: "failed" };
        }
        const body = await result.json();
        return { outcome: "sent", userId: (body.user ?? body).id };
      } catch { return { outcome: "unknown" }; }
    },
  };
}
