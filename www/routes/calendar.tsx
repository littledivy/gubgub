import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import CalendarEvents from "../islands/CalendarEvents.tsx";
import type { CalendarEvent, SessionUser } from "../lib.ts";
import { getContext, listUpcomingMeetEvents } from "../lib.ts";

interface CalendarData {
  events: CalendarEvent[];
  authStatus: { connected: boolean; email: string };
  user?: SessionUser;
  error?: string;
}

export const handler: Handlers<CalendarData> = {
  async GET(_req, ctx) {
    try {
      const { db, config } = await getContext();
      const settings = await db.getSettings();
      const email = settings["google_oauth_email"] || "";
      const hasToken = (settings["google_oauth_refresh_token"] || "") !== "";
      const authStatus = { connected: hasToken && email !== "", email };

      if (!authStatus.connected) {
        return ctx.render({
          events: [],
          authStatus,
          user: ctx.state.user as SessionUser,
        });
      }

      const events = await listUpcomingMeetEvents(db, config);
      return ctx.render({
        events,
        authStatus,
        user: ctx.state.user as SessionUser,
      });
    } catch (e) {
      return ctx.render({
        events: [],
        authStatus: { connected: false, email: "" },
        user: ctx.state.user as SessionUser,
        error: (e as Error).message,
      });
    }
  },
};

export default function CalendarPage({ data }: PageProps<CalendarData>) {
  const { events, authStatus, error } = data;

  return (
    <Layout title="Calendar" active="calendar" user={data.user}>
      {error && <div class="alert alert-error">{error}</div>}
      {!authStatus.connected
        ? (
          <div class="empty">
            <p>Connect your Google account to see upcoming meetings.</p>
            <a href="/settings">Go to Settings</a>
          </div>
        )
        : (
          <div>
            <p class="text-sm text-light mb-2">
              Upcoming Google Meet events for {authStatus.email}
            </p>
            <CalendarEvents events={events} />
          </div>
        )}
    </Layout>
  );
}
