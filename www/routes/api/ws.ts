import { Handlers } from "$fresh/server.ts";
import { getContext } from "../../lib.ts";

export const handler: Handlers = {
  async GET(req) {
    const upgrade = req.headers.get("upgrade")?.toLowerCase();
    if (upgrade !== "websocket") {
      return new Response("expected websocket upgrade", { status: 400 });
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    const { hub } = await getContext();
    hub.addClient(socket);

    return response;
  },
};
