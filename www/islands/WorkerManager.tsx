import { useCallback, useEffect, useRef, useState } from "preact/hooks";

interface Worker {
  id: string;
  url: string;
  port: number;
  providerName: string;
  startedAt: string;
  healthy: boolean;
  activeSessions: number;
  healthError: string;
  meta?: Record<string, unknown>;
}

function formatUptime(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const m = mins % 60;
  if (hours < 24) return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `${days}d ${h}h` : `${days}d`;
}

function LogViewer({ workerId }: { workerId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/workers/${workerId}/logs?stream=1`);

    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      const line = JSON.parse(e.data);
      setLines((prev) => {
        const next = [...prev, line];
        if (next.length > 500) next.splice(0, next.length - 500);
        return next;
      });
    };
    es.onerror = () => setConnected(false);

    return () => es.close();
  }, [workerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div class="worker-logs">
      <div class="worker-logs-header">
        <span class="worker-detail-label">logs</span>
        <span
          class={`worker-logs-status ${connected ? "worker-logs-live" : ""}`}
        >
          {connected ? "live" : "connecting..."}
        </span>
      </div>
      <div class="worker-logs-body">
        {lines.length === 0
          ? <span class="text-light">waiting for output...</span>
          : (
            lines.map((l, i) => <div key={i} class="worker-log-line">{l}</div>)
          )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

export default function WorkerManager() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [openLogs, setOpenLogs] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      const res = await fetch("/api/workers");
      if (!res.ok) throw new Error("Failed to fetch workers");
      const data = await res.json();
      setWorkers(data);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, [fetchWorkers]);

  const handleStart = async () => {
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/workers", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start worker");
      }
      await fetchWorkers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async (id: string) => {
    setStopping(id);
    setError("");
    try {
      const res = await fetch(`/api/workers/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to stop worker");
      }
      if (openLogs === id) setOpenLogs(null);
      await fetchWorkers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStopping(null);
    }
  };

  if (loading) {
    return (
      <div class="empty">
        <div class="spinner" style="margin: 0 auto" />
      </div>
    );
  }

  return (
    <div>
      {error && <div class="alert alert-error">{error}</div>}

      <div class="flex-between mb-2">
        <p class="text-sm text-light">
          {workers.length} worker{workers.length !== 1 ? "s" : ""} running
        </p>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? "Starting..." : "Start Worker"}
        </button>
      </div>

      {workers.length === 0
        ? (
          <div class="empty">
            <p>No workers running.</p>
            <p>Start a worker to begin recording meetings.</p>
          </div>
        )
        : (
          workers.map((w) => {
            const isExternal = w.id === "external";
            return (
              <div key={w.id} class="card worker-card">
                <div class="flex-between">
                  <div class="flex-gap">
                    <span
                      class={`worker-status-dot ${
                        w.healthy ? "worker-healthy" : "worker-unhealthy"
                      }`}
                    />
                    <span class="card-title">{w.url}</span>
                  </div>
                  <span
                    class={`badge ${w.healthy ? "badge-done" : "badge-failed"}`}
                  >
                    {w.healthy ? "healthy" : "unhealthy"}
                  </span>
                </div>

                {!w.healthy && w.healthError && (
                  <div class="card-error">{w.healthError}</div>
                )}

                <div class="worker-details">
                  <div class="worker-detail">
                    <span class="worker-detail-label">id</span>
                    <span class="worker-detail-value mono">
                      {isExternal ? "external" : w.id.slice(0, 8)}
                    </span>
                  </div>
                  <div class="worker-detail">
                    <span class="worker-detail-label">port</span>
                    <span class="worker-detail-value mono">{w.port}</span>
                  </div>
                  <div class="worker-detail">
                    <span class="worker-detail-label">provider</span>
                    <span class="worker-detail-value">{w.providerName}</span>
                  </div>
                  {w.startedAt && (
                    <div class="worker-detail">
                      <span class="worker-detail-label">uptime</span>
                      <span class="worker-detail-value">
                        {formatUptime(w.startedAt)}
                      </span>
                    </div>
                  )}
                  <div class="worker-detail">
                    <span class="worker-detail-label">sessions</span>
                    <span class="worker-detail-value">{w.activeSessions}</span>
                  </div>
                  {w.meta?.pid && (
                    <div class="worker-detail">
                      <span class="worker-detail-label">pid</span>
                      <span class="worker-detail-value mono">
                        {String(w.meta.pid)}
                      </span>
                    </div>
                  )}
                </div>

                {!isExternal && (
                  <div class="flex-gap mt-1">
                    <button
                      type="button"
                      class="btn btn-sm"
                      onClick={() =>
                        setOpenLogs(openLogs === w.id ? null : w.id)}
                    >
                      {openLogs === w.id ? "Hide Logs" : "Logs"}
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm"
                      onClick={() => handleStop(w.id)}
                      disabled={stopping === w.id}
                      style="color: var(--error)"
                    >
                      {stopping === w.id ? "Stopping..." : "Stop"}
                    </button>
                  </div>
                )}

                {!isExternal && openLogs === w.id && (
                  <LogViewer workerId={w.id} />
                )}
              </div>
            );
          })
        )}
    </div>
  );
}
