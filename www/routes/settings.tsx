import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import SettingsForm from "../islands/SettingsForm.tsx";
import { getContext } from "../lib.ts";
import type { SessionUser } from "../lib.ts";

interface SettingsData {
  settings: Record<string, string>;
  oauthStatus: { connected: boolean; email: string };
  oauthMessage?: string;
  user?: SessionUser;
  error?: string;
}

export const handler: Handlers<SettingsData> = {
  async GET(req, ctx) {
    const url = new URL(req.url);
    const oauthMessage = url.searchParams.get("oauth") ||
      url.searchParams.get("oauth_error") || undefined;

    try {
      const { db } = await getContext();
      const settings = await db.getSettings();
      const email = settings["google_oauth_email"] || "";
      const hasToken = (settings["google_oauth_refresh_token"] || "") !== "";
      const oauthStatus = { connected: hasToken && email !== "", email };

      return ctx.render({
        settings,
        oauthStatus,
        oauthMessage,
        user: ctx.state.user as SessionUser,
      });
    } catch (e) {
      return ctx.render({
        settings: {},
        oauthStatus: { connected: false, email: "" },
        user: ctx.state.user as SessionUser,
        error: (e as Error).message,
      });
    }
  },
};

export default function SettingsPage({ data }: PageProps<SettingsData>) {
  const { settings, oauthStatus, oauthMessage, user, error } = data;

  return (
    <Layout title="Settings" active="settings" user={user}>
      {error && <div class="alert alert-error">{error}</div>}
      <SettingsForm
        initialSettings={settings}
        oauthStatus={oauthStatus}
        oauthMessage={oauthMessage}
        isAdmin={user?.isAdmin}
      />
    </Layout>
  );
}
