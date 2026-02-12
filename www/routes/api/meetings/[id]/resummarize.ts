import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async POST(req, ctx) {
    const { db, hub, pipeline } = await getContext();
    const id = ctx.params.id;

    let body: { prompt?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid request body" }, { status: 400 });
    }

    const transcript = await db.getTranscript(id);
    if (!transcript) {
      return Response.json(
        { error: "transcript not found, cannot resummarize" },
        { status: 404 },
      );
    }

    await db.deleteSummaryByMeeting(id);
    await db.updateMeetingStatus(id, "summarizing", null);
    hub.broadcast({
      type: "status",
      meeting_id: id,
      status: "summarizing",
    });

    const prompt = body.prompt || pipeline.defaultSummaryPrompt;
    pipeline.summarize(id, transcript.content, prompt);

    return Response.json({ status: "resummarizing" });
  },
};
