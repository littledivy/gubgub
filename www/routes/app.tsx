import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../components/Layout.tsx";
import MeetingCard from "../components/MeetingCard.tsx";
import type { Meeting, SessionUser } from "../lib.ts";
import { getContext } from "../lib.ts";

interface DashboardData {
  meetings: Meeting[];
  user?: SessionUser;
  error?: string;
}

export const handler: Handlers<DashboardData> = {
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

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - day.getTime();
  const oneDay = 86400000;
  if (diff < oneDay) return "today";
  if (diff < oneDay * 2) return "yesterday";
  if (diff < oneDay * 7) {
    return d.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    .toLowerCase();
}

function groupByDate(meetings: Meeting[]): [string, Meeting[]][] {
  const groups: Map<string, Meeting[]> = new Map();
  for (const m of meetings) {
    const label = dateLabel(m.created_at);
    const list = groups.get(label) || [];
    list.push(m);
    groups.set(label, list);
  }
  return [...groups.entries()];
}

function formatHours(totalSeconds: number): string {
  if (totalSeconds < 60) return "<1m";
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function StatusBar({ meetings }: { meetings: Meeting[] }) {
  const total = meetings.length;
  if (total === 0) return null;
  const counts: Record<string, number> = {};
  for (const m of meetings) {
    counts[m.status] = (counts[m.status] || 0) + 1;
  }
  const segments: { status: string; count: number; color: string }[] = [];
  const colorMap: Record<string, string> = {
    done: "var(--success)",
    recording: "var(--error)",
    joining: "var(--warning)",
    processing: "var(--accent)",
    transcribing: "#7c3aed",
    summarizing: "var(--accent)",
    pending: "var(--fg-muted)",
    failed: "var(--error)",
  };
  for (const [status, count] of Object.entries(counts)) {
    segments.push({
      status,
      count,
      color: colorMap[status] || "var(--border)",
    });
  }

  return (
    <div class="dash-bar-wrap">
      <div class="dash-bar">
        {segments.map((s) => (
          <div
            key={s.status}
            class="dash-bar-seg"
            style={`flex: ${s.count}; background: ${s.color}`}
            title={`${s.status}: ${s.count}`}
          />
        ))}
      </div>
      <div class="dash-bar-legend">
        {segments.map((s) => (
          <span key={s.status} class="dash-legend-item">
            <span class="dash-legend-dot" style={`background: ${s.color}`} />
            {s.status} {s.count}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ data }: PageProps<DashboardData>) {
  const { meetings, error } = data;
  const active = meetings.filter((m) =>
    ["joining", "recording", "transcribing", "summarizing", "processing"]
      .includes(m.status)
  );
  const done = meetings.filter((m) => m.status === "done");
  const failed = meetings.filter((m) => m.status === "failed");
  const totalSeconds = meetings.reduce(
    (acc, m) => acc + (m.duration_seconds || 0),
    0,
  );
  const recent = meetings.slice(0, 12);
  const grouped = groupByDate(recent);

  return (
    <Layout active="dashboard" user={data.user}>
      <h1>Dashboard</h1>

      {error && (
        <div class="alert alert-error">
          Could not load data: {error}
        </div>
      )}

      <div class="dash-metrics">
        <div class="dash-metric-card">
          <span class="dash-metric-value">{meetings.length}</span>
          <span class="dash-metric-label">meetings</span>
        </div>
        <div class="dash-metric-card">
          <span class="dash-metric-value">{formatHours(totalSeconds)}</span>
          <span class="dash-metric-label">recorded</span>
        </div>
        <div class="dash-metric-card">
          {active.length > 0
            ? (
              <>
                <span class="dash-metric-value dash-metric-active">
                  <span class="badge-dot" />
                  {active.length}
                </span>
                <span class="dash-metric-label">active now</span>
              </>
            )
            : (
              <>
                <span class="dash-metric-value dash-metric-success">
                  {done.length}
                </span>
                <span class="dash-metric-label">completed</span>
              </>
            )}
        </div>
      </div>

      <StatusBar meetings={meetings} />

      {recent.length === 0
        ? (
          <div class="empty">
            <p>No meetings yet.</p>
            <a href="/meetings/new">Record your first meeting</a>
          </div>
        )
        : (
          grouped.map(([label, items]) => (
            <div key={label} class="date-group">
              <div class="date-label">{label}</div>
              {items.map((m) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  showThumb
                />
              ))}
            </div>
          ))
        )}
    </Layout>
  );
}
