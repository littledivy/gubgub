import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../lib.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { db } = await getContext();
    const meeting = await db.getMeeting(ctx.params.id);
    if (!meeting) {
      return Response.json({ error: "meeting not found" }, { status: 404 });
    }
    return Response.json(meeting);
  },

  async DELETE(_req, ctx) {
    const { db, storage } = await getContext();
    const id = ctx.params.id;
    const meeting = await db.getMeeting(id);
    if (!meeting) {
      return Response.json({ error: "meeting not found" }, { status: 404 });
    }

    if (meeting.recording_path) {
      await storage.delete(meeting.recording_path).catch((e) =>
        console.log(`delete recording ${meeting.recording_path}: ${e}`)
      );
    }
    if (meeting.wav_path) {
      await storage.delete(meeting.wav_path).catch((e) =>
        console.log(`delete wav ${meeting.wav_path}: ${e}`)
      );
    }

    await db.deleteMeeting(id);
    return Response.json({ status: "deleted" });
  },
};
