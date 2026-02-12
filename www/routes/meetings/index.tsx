import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";
import MeetingCard from "../../components/MeetingCard.tsx";
import type { Meeting, SessionUser } from "../../lib.ts";
import { getContext } from "../../lib.ts";

interface MeetingsData {
  meetings: Meeting[];
  user?: SessionUser;
  error?: string;
}

export const handler: Handlers<MeetingsData> = {
  async GET(_req, ctx) {
    try {
      const { db } = await getContext();
      const meetings = await db.listMeetings();
      return ctx.render({ meetings, user: ctx.state.user as SessionUser });
    } catch (e) {
      return ctx.render({ meetings: [], error: (e as Error).message });
    }
  },
};

export default function MeetingsPage({ data }: PageProps<MeetingsData>) {
  const { meetings, error } = data;

  return (
    <Layout title="Meetings" active="meetings" user={data.user}>
      {error && <div class="alert alert-error">{error}</div>}

      <p class="text-sm text-light mb-2">{meetings.length} meeting(s)</p>

      {meetings.length === 0
        ? (
          <div class="empty">
            <p>No meetings yet.</p>
          </div>
        )
        : (
          <div>
            {meetings.map((m) => <MeetingCard key={m.id} meeting={m} />)}
          </div>
        )}
    </Layout>
  );
}
