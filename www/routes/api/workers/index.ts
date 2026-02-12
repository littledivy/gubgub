import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { orchestrator } = await getContext();
    const workers = orchestrator.list();

    const enriched = await Promise.all(workers.map(async (w) => {
      let healthy = false;
      let activeSessions = 0;
      let healthError = "";
      try {
        const resp = await fetch(`${w.url}/api/health`);
        if (resp.ok) {
          healthy = true;
          const data = await resp.json();
          activeSessions = data.active_sessions || 0;
        } else {
          healthError = `HTTP ${resp.status}`;
        }
      } catch (e) {
        healthError = (e as Error).message || "connection refused";
      }
      return { ...w, healthy, activeSessions, healthError };
    }));

    return Response.json(enriched);
  },

  async POST() {
    const { orchestrator } = await getContext();
    try {
      const worker = await orchestrator.start();
      return Response.json(worker, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ error: msg }, { status: 500 });
    }
  },
};
