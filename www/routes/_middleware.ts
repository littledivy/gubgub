import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { getContext, getSessionUser } from "../lib.ts";

const PUBLIC_PATHS = [
  "/login",
  "/install",
  "/api/auth/login",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/logout",
];

export async function handler(req: Request, ctx: MiddlewareHandlerContext) {
  if (ctx.destination === "static") {
    return ctx.next();
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"))) {
    return ctx.next();
  }

  const { db, config } = await getContext();

  // Landing page: show if NOT_SELF_HOSTED or DEV_LANDING, otherwise redirect to /app
  if (path === "/") {
    if (config.notSelfHosted || Deno.env.get("DEV_LANDING") === "1") {
      return ctx.next();
    }
    return Response.redirect(new URL("/app", req.url), 307);
  }

  const user = await getSessionUser(req, db, config);
  if (!user) {
    return Response.redirect(new URL("/login", req.url), 307);
  }

  ctx.state.user = user;
  return ctx.next();
}
