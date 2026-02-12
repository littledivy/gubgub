import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { db } = await getContext();
    const transcript = await db.getTranscript(ctx.params.id);
    if (!transcript) {
      return Response.json(
        { error: "transcript not found" },
        { status: 404 },
      );
    }
    return Response.json(transcript);
  },
};
