import { Handlers } from "$fresh/server.ts";
import { getContext, workerLogs } from "../../../../lib.ts";

export const handler: Handlers = {
  async GET(req, ctx) {
    const { orchestrator } = await getContext();
    const worker = orchestrator.get(ctx.params.id);
    if (!worker) {
      return Response.json({ error: "worker not found" }, { status: 404 });
    }

    const url = new URL(req.url);
    const stream = url.searchParams.get("stream") === "1";

    if (!stream) {
      return Response.json(workerLogs.get(ctx.params.id));
    }

    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const existing = workerLogs.get(ctx.params.id);
        for (const line of existing) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(line)}\n\n`),
          );
        }

        const unsubscribe = workerLogs.subscribe(ctx.params.id, (line) => {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(line)}\n\n`),
            );
          } catch {
            unsubscribe();
          }
        });

        req.signal.addEventListener("abort", () => {
          unsubscribe();
          try {
            controller.close();
          } catch { /* already closed */ }
        });
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  },
};
