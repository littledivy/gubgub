import { useState } from "preact/hooks";

export default function MeetingForm() {
  const [title, setTitle] = useState("");
  const [meetUrl, setMeetUrl] = useState("");
  const [authMode, setAuthMode] = useState("guest");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch(`/api/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, meet_url: meetUrl, auth_mode: authMode }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create meeting");
      }

      const meeting = await res.json();
      window.location.href = `/meetings/${meeting.id}`;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <div class="alert alert-error">{error}</div>}

      <div>
        <label>Title</label>
        <input
          type="text"
          value={title}
          onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          placeholder="Weekly standup"
          required
        />
      </div>

      <div>
        <label>Google Meet URL</label>
        <input
          type="url"
          value={meetUrl}
          onInput={(e) => setMeetUrl((e.target as HTMLInputElement).value)}
          placeholder="https://meet.google.com/abc-defg-hij"
          required
        />
      </div>

      <div>
        <label>Join mode</label>
        <select
          value={authMode}
          onChange={(e) => setAuthMode((e.target as HTMLSelectElement).value)}
        >
          <option value="guest">Guest (no login required)</option>
          <option value="account">
            Google account (uses saved credentials)
          </option>
        </select>
        <p class="field-hint">
          Guest mode joins without a Google account. The meeting host must admit
          the bot.
        </p>
      </div>

      <button
        type="submit"
        disabled={loading}
        class="btn-primary btn-full"
      >
        {loading ? "Starting..." : "Start Recording"}
      </button>
    </form>
  );
}
