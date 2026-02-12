import { useState } from "preact/hooks";

interface Props {
  meetingId: string;
  hasTranscript: boolean;
}

export default function TranscriptViewer({ meetingId, hasTranscript }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!hasTranscript) return null;

  const handleResummarize = async () => {
    setLoading(true);
    setMessage("");
    try {
      const res = await fetch(`/api/meetings/${meetingId}/resummarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      setMessage("Re-summarizing... refresh in a moment.");
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <label>Re-generate summary</label>
      <textarea
        value={prompt}
        onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
        placeholder="Custom prompt (leave empty for default)..."
        rows={3}
      />
      <div class="flex-gap">
        <button
          onClick={handleResummarize}
          disabled={loading}
          class="btn-sm"
        >
          {loading ? "Processing..." : "Re-summarize"}
        </button>
        {message && <span class="text-sm text-light">{message}</span>}
      </div>
    </div>
  );
}
