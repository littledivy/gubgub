import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async POST() {
    const { db } = await getContext();
    await db.updateSettings({
      "google_oauth_access_token": "",
      "google_oauth_refresh_token": "",
      "google_oauth_expiry": "",
      "google_oauth_email": "",
    });
    return Response.json({ status: "disconnected" });
  },
};
