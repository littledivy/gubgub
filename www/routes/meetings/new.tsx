import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";
import MeetingForm from "../../islands/MeetingForm.tsx";
import type { SessionUser } from "../../lib.ts";

interface NewMeetingData {
  user?: SessionUser;
}

export const handler: Handlers<NewMeetingData> = {
  GET(_req, ctx) {
    return ctx.render({ user: ctx.state.user as SessionUser });
  },
};

export default function NewMeetingPage({ data }: PageProps<NewMeetingData>) {
  return (
    <Layout title="New Meeting" active="meetings" user={data.user}>
      <MeetingForm />
    </Layout>
  );
}
