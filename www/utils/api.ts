export type {
  CalendarEvent,
  GoogleAuthStatus,
  Meeting,
  Summary,
  Transcript,
} from "../lib.ts";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  listMeetings: () => apiFetch<import("../lib.ts").Meeting[]>("/api/meetings"),
  getMeeting: (id: string) =>
    apiFetch<import("../lib.ts").Meeting>(`/api/meetings/${id}`),
  createMeeting: (
    data: { title: string; meet_url: string; auth_mode: string },
  ) =>
    apiFetch<import("../lib.ts").Meeting>("/api/meetings", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteMeeting: (id: string) =>
    apiFetch<{ status: string }>(`/api/meetings/${id}`, { method: "DELETE" }),
  stopMeeting: (id: string) =>
    apiFetch<{ status: string }>(`/api/meetings/${id}/stop`, {
      method: "POST",
    }),
  retryMeeting: (id: string) =>
    apiFetch<{ status: string }>(`/api/meetings/${id}/retry`, {
      method: "POST",
    }),

  getTranscript: (meetingId: string) =>
    apiFetch<import("../lib.ts").Transcript>(
      `/api/meetings/${meetingId}/transcript`,
    ),
  getSummary: (meetingId: string) =>
    apiFetch<import("../lib.ts").Summary>(`/api/meetings/${meetingId}/summary`),
  resummarize: (meetingId: string, prompt?: string) =>
    apiFetch<{ status: string }>(`/api/meetings/${meetingId}/resummarize`, {
      method: "POST",
      body: JSON.stringify({ prompt: prompt || "" }),
    }),

  getSettings: () => apiFetch<Record<string, string>>("/api/settings"),
  updateSettings: (settings: Record<string, string>) =>
    apiFetch<{ status: string }>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    }),

  getGoogleAuthStatus: () =>
    apiFetch<import("../lib.ts").GoogleAuthStatus>("/api/auth/google/status"),
  disconnectGoogle: () =>
    apiFetch<{ status: string }>("/api/auth/google/disconnect", {
      method: "POST",
    }),

  getCalendarEvents: () =>
    apiFetch<import("../lib.ts").CalendarEvent[]>("/api/calendar/events"),

  health: () => apiFetch<{ status: string; ollama_url: string }>("/api/health"),

  wsURL: () => {
    if (typeof globalThis.location !== "undefined") {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}/api/ws`;
    }
    return "ws://localhost:8000/api/ws";
  },
};
