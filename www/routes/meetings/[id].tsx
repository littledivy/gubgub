import { Handlers, PageProps } from "$fresh/server.ts";
import Layout from "../../components/Layout.tsx";
import StatusBadge from "../../components/StatusBadge.tsx";
import TranscriptView from "../../components/TranscriptView.tsx";
import SummaryView from "../../components/SummaryView.tsx";
import MeetingStatus from "../../islands/MeetingStatus.tsx";
import TranscriptViewer from "../../islands/TranscriptViewer.tsx";
import VideoPlayer from "../../islands/VideoPlayer.tsx";
import type { Meeting, SessionUser, Summary, Transcript } from "../../lib.ts";
import { getContext } from "../../lib.ts";

interface MeetingDetailData {
  meeting: Meeting;
  transcript?: Transcript;
  summary?: Summary;
  user?: SessionUser;
  error?: string;
}

export const handler: Handlers<MeetingDetailData> = {
  async GET(_req, ctx) {
    const { id } = ctx.params;
    try {
      const { db } = await getContext();
      const meeting = await db.getMeeting(id);
      if (!meeting) {
        return ctx.render({
          meeting: {
            id,
            title: "Unknown",
            meet_url: "",
            status: "pending",
            auth_mode: "guest",
            created_at: "",
            updated_at: "",
          },
          error: "meeting not found",
        });
      }
      const transcript = (await db.getTranscript(id)) ?? undefined;
      const summary = (await db.getSummary(id)) ?? undefined;
      return ctx.render({
        meeting,
        transcript,
        summary,
        user: ctx.state.user as SessionUser,
      });
    } catch (e) {
      return ctx.render({
        meeting: {
          id,
          title: "Unknown",
          meet_url: "",
          status: "pending",
          auth_mode: "guest",
          created_at: "",
          updated_at: "",
        },
        error: (e as Error).message,
      });
    }
  },
};

export default function MeetingDetail({ data }: PageProps<MeetingDetailData>) {
  const { meeting, transcript, summary, error } = data;
  const isActive = [
    "joining",
    "recording",
    "transcribing",
    "summarizing",
    "processing",
  ].includes(meeting.status);
  const hasRecording = !!meeting.recording_path;

  return (
    <Layout active="meetings" user={data.user}>
      {error && <div class="alert alert-error">{error}</div>}

      <div class="flex-between mb-2">
        <h1 class="mb-0">{meeting.title}</h1>
        <div class="flex-gap" style="align-items: center">
          <StatusBadge status={meeting.status} />
          {!isActive && (
            <button
              type="button"
              class="btn-icon"
              title="Delete meeting"
              onClick={`if(confirm('Delete this meeting and its recording? This cannot be undone.')){this.disabled=true;fetch('/api/meetings/${meeting.id}',{method:'DELETE'}).then(()=>location.href='/meetings')}`}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <p class="card-url">{meeting.meet_url}</p>
      <p class="text-xs text-light">
        {new Date(meeting.created_at).toLocaleString()}
      </p>

      <div class="flex-gap mb-2">
        {meeting.status === "recording" && (
          <button
            type="button"
            class="btn-danger btn-sm"
            onClick={`this.disabled=true;this.textContent='stopping...';fetch('/api/meetings/${meeting.id}/stop', {method:'POST'}).then(()=>setTimeout(()=>location.reload(),2000))`}
          >
            stop recording
          </button>
        )}
        {meeting.status === "failed" && (
          <button
            type="button"
            class="btn-sm"
            onClick={`fetch('/api/meetings/${meeting.id}/retry', {method:'POST'}).then(()=>location.reload())`}
          >
            retry
          </button>
        )}
      </div>

      {meeting.error_message && (
        <div class="alert alert-error">{meeting.error_message}</div>
      )}

      {isActive && (
        <MeetingStatus meetingId={meeting.id} initialStatus={meeting.status} />
      )}

      {hasRecording && (
        <VideoPlayer src={`/api/meetings/${meeting.id}/recording`} />
      )}

      <div class="section">
        <div class="section-title">Transcript</div>
        {transcript
          ? <TranscriptView transcript={transcript} />
          : (
            <p class="text-sm text-light">
              {["pending", "joining", "recording"].includes(meeting.status)
                ? "Transcript will appear after recording is complete."
                : meeting.status === "transcribing"
                ? "Transcribing..."
                : "No transcript available."}
            </p>
          )}
      </div>

      <div class="section">
        <div class="section-title">Summary</div>
        {summary
          ? (
            <div>
              <SummaryView summary={summary} />
              <div class="mt-2">
                <TranscriptViewer
                  meetingId={meeting.id}
                  hasTranscript={!!transcript}
                />
              </div>
            </div>
          )
          : (
            <p class="text-sm text-light">
              {meeting.status === "summarizing"
                ? "Generating summary..."
                : "No summary available."}
            </p>
          )}
      </div>
    </Layout>
  );
}
