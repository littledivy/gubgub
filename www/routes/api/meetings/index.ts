import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { db } = await getContext();
    const meetings = await db.listMeetings();
    return Response.json(meetings);
  },

  async POST(req) {
    const { db, pipeline } = await getContext();
    let body: { title?: string; meet_url?: string; auth_mode?: string };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "invalid request body" }, { status: 400 });
    }

    if (!body.title || !body.meet_url) {
      return Response.json(
        { error: "title and meet_url are required" },
        { status: 400 },
      );
    }

    const authMode = body.auth_mode || "guest";
    const meeting = await db.createMeeting(body.title, body.meet_url, authMode);

    pipeline.run(meeting.id);

    return Response.json(meeting, { status: 201 });
  },
};
