import { useState } from "preact/hooks";

interface Props {
  initialSettings: Record<string, string>;
  oauthStatus?: { connected: boolean; email: string };
  oauthMessage?: string;
  isAdmin?: boolean;
}

const fields = [
  {
    key: "ollama_url",
    label: "Ollama URL",
    type: "text",
    placeholder: "http://localhost:11434",
  },
  {
    key: "ollama_model",
    label: "Ollama model",
    type: "text",
    placeholder: "llama3.2",
  },
  {
    key: "whisper_model",
    label: "Whisper model",
    type: "text",
    placeholder: "base",
  },
];

export default function SettingsForm(
  { initialSettings, oauthStatus, oauthMessage, isAdmin }: Props,
) {
  const [settings, setSettings] = useState<Record<string, string>>(
    initialSettings,
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [googleStatus, setGoogleStatus] = useState(oauthStatus);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleGoogleConnect = () => {
    window.location.href = `/api/auth/google`;
  };

  const handleGoogleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await fetch(`/api/auth/google/disconnect`, { method: "POST" });
      setGoogleStatus({ connected: false, email: "" });
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSave = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch(`/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setMessage("saved.");
    } catch (e) {
      setMessage(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div class="section">
        <div class="section-title">Google Account</div>
        {oauthMessage && (
          <div
            class={oauthMessage === "success"
              ? "alert alert-success"
              : "alert alert-error"}
          >
            {oauthMessage === "success"
              ? "Google account connected."
              : `OAuth error: ${oauthMessage}`}
          </div>
        )}
        {googleStatus?.connected
          ? (
            <div class="flex-between">
              <div>
                <span class="text-sm">Signed in as </span>
                <strong class="text-sm">{googleStatus.email}</strong>
              </div>
              <button
                type="button"
                class="btn btn-sm"
                onClick={handleGoogleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          )
          : (
            <div>
              <p class="text-sm text-light mb-1">
                Connect your Google account to browse calendar events and record
                meetings.
              </p>
              <button
                type="button"
                class="btn btn-primary"
                onClick={handleGoogleConnect}
              >
                Sign in with Google
              </button>
            </div>
          )}
      </div>

      <div class="section mt-2">
        <div class="section-title">Services</div>
        <form onSubmit={handleSave}>
          {fields.map((f) => (
            <div key={f.key}>
              <label>{f.label}</label>
              <input
                type={f.type}
                value={settings[f.key] || ""}
                onInput={(e) =>
                  setSettings({
                    ...settings,
                    [f.key]: (e.target as HTMLInputElement).value,
                  })}
                placeholder={f.placeholder}
              />
            </div>
          ))}

          {isAdmin && (
            <>
              <div class="section-title mt-2">Worker</div>
              <div>
                <label>Worker URL</label>
                <input
                  type="text"
                  value={settings["worker_url"] || ""}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      worker_url: (e.target as HTMLInputElement).value,
                    })}
                  placeholder="http://localhost:8089"
                />
                <div class="field-hint">
                  Override the worker URL used for transcription.
                </div>
              </div>

              <div class="section-title mt-2">Access Control</div>
              <div>
                <label>Allowed domain</label>
                <input
                  type="text"
                  value={settings["allowed_domain"] || ""}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      allowed_domain: (e.target as HTMLInputElement).value,
                    })}
                  placeholder="yourcompany.com"
                />
                <div class="field-hint">
                  Anyone with an @domain email can sign in.
                </div>
              </div>
              <div>
                <label>Allowed emails</label>
                <input
                  type="text"
                  value={settings["allowed_emails"] || ""}
                  onInput={(e) =>
                    setSettings({
                      ...settings,
                      allowed_emails: (e.target as HTMLInputElement).value,
                    })}
                  placeholder="alice@gmail.com, bob@example.com"
                />
                <div class="field-hint">
                  Comma-separated list of individual emails that can sign in.
                </div>
              </div>
            </>
          )}

          <div class="flex-gap mt-1">
            <button
              type="submit"
              disabled={saving}
              class="btn btn-primary"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
            {message && <span class="text-sm text-light">{message}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
