import { Handlers } from "$fresh/server.ts";
import { buildAuthURL, getContext } from "../../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { config, db } = await getContext();

    if (!config.googleClientID || !config.googleClientSecret) {
      return Response.json(
        {
          error:
            "Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        },
        { status: 400 },
      );
    }

    const stateBytes = new Uint8Array(16);
    crypto.getRandomValues(stateBytes);
    const state = Array.from(stateBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await db.updateSettings({ google_oauth_state: state });

    const url = buildAuthURL(config, state);
    return Response.redirect(url, 307);
  },
};
