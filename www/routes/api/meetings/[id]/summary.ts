import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { db } = await getContext();
    const summary = await db.getSummary(ctx.params.id);
    if (!summary) {
      return Response.json({ error: "summary not found" }, { status: 404 });
    }
    return Response.json(summary);
  },
};
