import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../lib.ts";
import type { SessionUser } from "../../lib.ts";

const ADMIN_ONLY_KEYS = ["allowed_domain", "allowed_emails", "session_secret", "worker_url"];

export const handler: Handlers = {
  async GET() {
    const { db } = await getContext();
    const settings = await db.getSettings();
    return Response.json(settings);
  },

  async PUT(req, ctx) {
    const { db } = await getContext();
    let body: Record<string, string>;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid request body" }, { status: 400 });
    }

    const user = ctx.state.user as SessionUser | undefined;
    const hasAdminKeys = Object.keys(body).some((k) =>
      ADMIN_ONLY_KEYS.includes(k)
    );
    if (hasAdminKeys && !user?.isAdmin) {
      return Response.json({ error: "admin access required" }, { status: 403 });
    }

    await db.updateSettings(body);
    return Response.json({ status: "updated" });
  },
};
