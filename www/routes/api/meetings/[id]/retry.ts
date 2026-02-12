import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async POST(_req, ctx) {
    const { db, pipeline } = await getContext();
    const id = ctx.params.id;
    const meeting = await db.getMeeting(id);
    if (!meeting) {
      return Response.json({ error: "meeting not found" }, { status: 404 });
    }
    if (meeting.status !== "failed") {
      return Response.json(
        { error: "can only retry failed meetings" },
        { status: 400 },
      );
    }

    await db.updateMeetingStatus(id, "pending", null);
    pipeline.run(id);
    return Response.json({ status: "retrying" });
  },
};
