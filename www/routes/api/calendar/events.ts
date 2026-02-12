import { Handlers } from "$fresh/server.ts";
import { getContext, listUpcomingMeetEvents } from "../../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { db, config } = await getContext();

    try {
      const events = await listUpcomingMeetEvents(db, config);
      return Response.json(events);
    } catch (e) {
      return Response.json(
        { error: (e as Error).message },
        { status: 500 },
      );
    }
  },
};
