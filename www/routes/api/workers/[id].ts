import { Handlers } from "$fresh/server.ts";
import { getContext, WorkerClient } from "../../../lib.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { orchestrator } = await getContext();
    const worker = orchestrator.get(ctx.params.id);
    if (!worker) {
      return Response.json({ error: "worker not found" }, { status: 404 });
    }

    let healthy = false;
    try {
      const client = new WorkerClient(worker.url);
      await client.health();
      healthy = true;
    } catch {
      // not healthy
    }

    return Response.json({ ...worker, healthy });
  },

  async DELETE(_req, ctx) {
    const { orchestrator } = await getContext();
    try {
      await orchestrator.stop(ctx.params.id);
      return Response.json({ status: "stopped" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) {
        return Response.json({ error: msg }, { status: 404 });
      }
      return Response.json({ error: msg }, { status: 500 });
    }
  },
};
