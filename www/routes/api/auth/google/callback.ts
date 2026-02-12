import { Handlers } from "$fresh/server.ts";
import {
  createSessionCookie,
  exchangeCode,
  fetchUserInfo,
  getContext,
  isEmailAllowed,
} from "../../../../lib.ts";

export const handler: Handlers = {
  async GET(req) {
    const { config, db } = await getContext();
    const url = new URL(req.url);
    const baseURL = `${url.protocol}//${url.host}`;

    const settings = await db.getSettings();
    const expectedState = settings["google_oauth_state"];
    const state = url.searchParams.get("state");

    if (state !== expectedState || !expectedState) {
      const dest = state?.startsWith("login:")
        ? "/login?error=invalid_state"
        : "/settings?oauth_error=invalid_state";
      return Response.redirect(`${baseURL}${dest}`, 307);
    }

    const isLogin = state.startsWith("login:");

    const errParam = url.searchParams.get("error");
    if (errParam) {
      const dest = isLogin
        ? `/login?error=${errParam}`
        : `/settings?oauth_error=${errParam}`;
      return Response.redirect(`${baseURL}${dest}`, 307);
    }

    const code = url.searchParams.get("code");
    if (!code) {
      const dest = isLogin
        ? "/login?error=no_code"
        : "/settings?oauth_error=no_code";
      return Response.redirect(`${baseURL}${dest}`, 307);
    }

    try {
      const token = await exchangeCode(config, code);
      const userInfo = await fetchUserInfo(token.access_token);

      await db.updateSettings({ google_oauth_state: "" });

      if (isLogin) {
        const allowed = await isEmailAllowed(db, config, userInfo.email);
        if (!allowed) {
          console.log(`auth: denied login for ${userInfo.email}`);
          return Response.redirect(`${baseURL}/login?error=not_allowed`, 307);
        }

        console.log(`auth: login success for ${userInfo.email}`);
        const cookie = await createSessionCookie(db, userInfo.email);
        return new Response(null, {
          status: 307,
          headers: {
            "Location": `${baseURL}/app`,
            "Set-Cookie": cookie,
          },
        });
      } else {
        const expiry = new Date(
          Date.now() + token.expires_in * 1000,
        ).toISOString();

        await db.updateSettings({
          "google_oauth_access_token": token.access_token,
          "google_oauth_refresh_token": token.refresh_token,
          "google_oauth_expiry": expiry,
          "google_oauth_email": userInfo.email,
        });

        console.log(`auth: google connected as ${userInfo.email}`);
        return Response.redirect(`${baseURL}/settings?oauth=success`, 307);
      }
    } catch (e) {
      console.error(`auth: oauth exchange failed: ${e}`);
      const dest = isLogin
        ? "/login?error=exchange_failed"
        : "/settings?oauth_error=exchange_failed";
      return Response.redirect(`${baseURL}${dest}`, 307);
    }
  },
};
