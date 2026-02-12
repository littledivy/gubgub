import { Handlers } from "$fresh/server.ts";
import { clearSessionCookie } from "../../../lib.ts";

export const handler: Handlers = {
  GET(req) {
    const url = new URL(req.url);
    return new Response(null, {
      status: 307,
      headers: {
        "Location": `${url.protocol}//${url.host}/login`,
        "Set-Cookie": clearSessionCookie(),
      },
    });
  },
};
