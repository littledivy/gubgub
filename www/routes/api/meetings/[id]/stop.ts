import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async POST(_req, ctx) {
    const { pipeline } = await getContext();
    await pipeline.stop(ctx.params.id);
    return Response.json({ status: "stopping" });
  },
};
