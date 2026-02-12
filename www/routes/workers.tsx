import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import WorkerManager from "../islands/WorkerManager.tsx";
import type { SessionUser } from "../lib.ts";

interface WorkersData {
  user?: SessionUser;
}

export const handler: Handlers<WorkersData> = {
  GET(_req, ctx) {
    const user = ctx.state.user as SessionUser | undefined;
    if (!user?.isAdmin) {
      return Response.redirect(new URL("/app", _req.url), 307);
    }
    return ctx.render({ user });
  },
};

export default function WorkersPage({ data }: PageProps<WorkersData>) {
  return (
    <Layout title="Workers" active="workers" user={data.user}>
      <WorkerManager />
    </Layout>
  );
}
