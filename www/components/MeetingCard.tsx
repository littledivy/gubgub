import StatusBadge from "./StatusBadge.tsx";
import type { Meeting } from "../utils/api.ts";

interface MeetingCardProps {
  meeting: Meeting;
  showThumb?: boolean;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MeetingCard({ meeting, showThumb }: MeetingCardProps) {
  const hasRecording = !!meeting.recording_path;

  return (
    <a
      href={`/meetings/${meeting.id}`}
      class={showThumb ? "card card-thumb" : "card"}
    >
      {showThumb && (
        <div class="card-thumb-img">
          {hasRecording
            ? (
              <video
                preload="metadata"
                src={`/api/meetings/${meeting.id}/recording#t=2`}
                muted
              />
            )
            : (
              <div class="card-thumb-placeholder">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
              </div>
            )}
        </div>
      )}
      <div class={showThumb ? "card-thumb-body" : ""}>
        <div class="flex-between">
          <span class="card-title">{meeting.title}</span>
          <StatusBadge status={meeting.status} />
        </div>
        <div class="card-meta">
          {timeAgo(meeting.created_at)}
          {meeting.duration_seconds
            ? ` · ${formatDuration(meeting.duration_seconds)}`
            : ""}
        </div>
        {meeting.error_message && (
          <div class="card-error">{meeting.error_message}</div>
        )}
      </div>
    </a>
  );
}
