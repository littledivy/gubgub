import { useEffect, useState } from "preact/hooks";

interface Props {
  meetingId: string;
  initialStatus: string;
}

const statusLabels: Record<string, string> = {
  pending: "Waiting to start...",
  joining: "Joining the meeting...",
  recording: "Recording in progress",
  processing: "Processing audio...",
  transcribing: "Generating transcript...",
  summarizing: "Creating summary...",
  done: "Complete",
  failed: "Failed",
};

export default function MeetingStatus({ meetingId, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: number;

    function connect() {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const wsURL = `${proto}//${location.host}/api/ws`;
      ws = new WebSocket(wsURL);

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        reconnectTimer = setTimeout(connect, 3000) as unknown as number;
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "status" && msg.meeting_id === meetingId) {
            setStatus(msg.status);
            if (msg.status === "done" || msg.status === "failed") {
              setTimeout(() => location.reload(), 1000);
            }
          }
        } catch {}
      };
    }

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [meetingId]);

  const label = statusLabels[status] || status;
  const isActive = !["done", "failed"].includes(status);

  return (
    <div class="live-status">
      {isActive && <div class="spinner" />}
      <div>
        <div class="live-label">{label}</div>
        <div class="live-sub">
          {connected ? "live updates connected" : "connecting..."}
        </div>
      </div>
    </div>
  );
}
