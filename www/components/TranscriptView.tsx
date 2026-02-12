import type { Transcript } from "../utils/api.ts";

interface TranscriptViewProps {
  transcript: Transcript;
}

interface Segment {
  start?: number;
  end?: number;
  text: string;
  speaker?: string;
}

function formatTime(seconds?: number): string {
  if (seconds == null) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TranscriptView({ transcript }: TranscriptViewProps) {
  let segments: Segment[] = [];
  try {
    if (transcript.segments) {
      segments = JSON.parse(transcript.segments);
    }
  } catch {
  }

  if (segments.length > 0) {
    return (
      <div>
        {segments.map((seg, i) => (
          <div key={i} class="segment">
            {seg.start != null && (
              <span class="segment-time">{formatTime(seg.start)}</span>
            )}
            <span class="segment-text">{seg.text}</span>
          </div>
        ))}
      </div>
    );
  }

  return <div class="summary-content">{transcript.content}</div>;
}
