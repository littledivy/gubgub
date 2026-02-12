import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { db } = await getContext();
    const settings = await db.getSettings();

    const email = settings["google_oauth_email"] || "";
    const hasToken = (settings["google_oauth_refresh_token"] || "") !== "";

    return Response.json({
      connected: hasToken && email !== "",
      email,
    });
  },
};
