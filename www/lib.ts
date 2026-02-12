import * as Minio from "minio";
import { join } from "$std/path/join.ts";
import { basename } from "$std/path/basename.ts";
import { resolve } from "$std/path/resolve.ts";

export type MeetingStatus =
  | "pending"
  | "joining"
  | "recording"
  | "processing"
  | "transcribing"
  | "summarizing"
  | "done"
  | "failed";

export interface Meeting {
  id: string;
  title: string;
  meet_url: string;
  status: MeetingStatus;
  auth_mode: string;
  error_message?: string | null;
  recording_path?: string | null;
  wav_path?: string | null;
  duration_seconds?: number | null;
  worker_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  content: string;
  segments?: string | null;
  language?: string | null;
  created_at: string;
}

export interface Summary {
  id: string;
  meeting_id: string;
  content: string;
  model: string;
  prompt_template?: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  meet_url: string;
  organizer: string;
  description?: string;
}

export interface WSStatusMessage {
  type: string;
  meeting_id: string;
  status: string;
  message?: string;
}

export interface WorkerSessionStatus {
  session_id: string;
  status: string;
  webm_path?: string;
  wav_path?: string;
  error?: string;
}

export interface WorkerJoinRequest {
  meet_url: string;
  display_name: string;
  auth_mode: string;
  google_email?: string;
  google_password?: string;
}

export interface Config {
  port: number;
  recordingsDir: string;
  ollamaURL: string;
  ollamaModel: string;
  whisperBin: string;
  whisperModel: string;
  workerURL: string;
  googleClientID: string;
  googleClientSecret: string;
  googleRedirectURL: string;
  adminEmail: string;
  notSelfHosted: boolean;
  transcriptionProvider: string;
  openAITranscriptionURL: string;
  openAITranscriptionKey: string;
  openAITranscriptionModel: string;
  summarizationProvider: string;
  openAIAPIKey: string;
  openAIAPIURL: string;
  openAIModel: string;
  anthropicAPIKey: string;
  anthropicModel: string;
  workerDir: string;
  workerBinary: string;
  workerHeadless: boolean;
  workerChromePath: string;
  workerPortStart: number;
  autoStartWorker: boolean;
  profilesDir: string;
}

export interface ManagedWorker {
  id: string;
  url: string;
  providerName: string;
  port: number;
  startedAt: string;
  meta?: Record<string, unknown>;
}

export interface GoogleAuthStatus {
  connected: boolean;
  email: string;
}

export interface TranscribeResult {
  text: string;
  segments: string;
  language: string;
}

function getEnv(key: string, fallback: string): string {
  return Deno.env.get(key) || fallback;
}

function getEnvInt(key: string, fallback: number): number {
  const v = Deno.env.get(key);
  if (v) {
    const n = parseInt(v, 10);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

export function settingOrConfig(
  settings: Record<string, string>,
  key: string,
  configDefault: string,
): string {
  const v = settings[key];
  if (v && v !== "") return v;
  return configDefault;
}

export function loadConfig(): Config {
  return {
    port: getEnvInt("PORT", 8000),
    recordingsDir: getEnv("RECORDINGS_DIR", "./data/recordings"),
    ollamaURL: getEnv("OLLAMA_URL", "http://localhost:11434"),
    ollamaModel: getEnv("OLLAMA_MODEL", "gemma3:latest"),
    whisperBin: getEnv("WHISPER_BIN", "whisper-cli"),
    whisperModel: getEnv("WHISPER_MODEL", "./models/ggml-base.bin"),
    workerURL: getEnv("WORKER_URL", "http://localhost:8089"),
    googleClientID: getEnv("GOOGLE_CLIENT_ID", ""),
    googleClientSecret: getEnv("GOOGLE_CLIENT_SECRET", ""),
    googleRedirectURL: getEnv(
      "GOOGLE_REDIRECT_URL",
      "http://localhost:3000/api/auth/google/callback",
    ),
    adminEmail: getEnv("ADMIN_EMAIL", ""),
    notSelfHosted: getEnv("NOT_SELF_HOSTED", "") === "true",
    transcriptionProvider: getEnv("TRANSCRIPTION_PROVIDER", "whisper"),
    openAITranscriptionURL: getEnv(
      "OPENAI_TRANSCRIPTION_URL",
      "https://api.openai.com",
    ),
    openAITranscriptionKey: getEnv("OPENAI_TRANSCRIPTION_API_KEY", ""),
    openAITranscriptionModel: getEnv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1"),
    summarizationProvider: getEnv("SUMMARIZATION_PROVIDER", "ollama"),
    openAIAPIKey: getEnv("OPENAI_API_KEY", ""),
    openAIAPIURL: getEnv("OPENAI_API_URL", "https://api.openai.com"),
    openAIModel: getEnv("OPENAI_MODEL", "gpt-4o"),
    anthropicAPIKey: getEnv("ANTHROPIC_API_KEY", ""),
    anthropicModel: getEnv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
    workerDir: getEnv("WORKER_DIR", ".."),
    workerBinary: getEnv("WORKER_BINARY", ""),
    workerHeadless: getEnv("WORKER_HEADLESS", "false") === "true",
    workerChromePath: getEnv("WORKER_CHROME_PATH", ""),
    workerPortStart: getEnvInt("WORKER_PORT_START", 8091),
    autoStartWorker: getEnv("AUTO_START_WORKER", "false") === "true",
    profilesDir: getEnv("PROFILES_DIR", "./data/chrome-profiles"),
  };
}

const SETTINGS_DEFAULTS: Record<string, string> = {
  "ollama_url": "http://localhost:11434",
  "ollama_model": "gemma3:latest",
  "whisper_model": "base",
  "transcription_provider": "whisper",
  "openai_transcription_url": "https://api.openai.com",
  "openai_transcription_api_key": "",
  "openai_transcription_model": "whisper-1",
  "summarization_provider": "ollama",
  "openai_api_key": "",
  "openai_api_url": "https://api.openai.com",
  "openai_model": "gpt-4o",
  "anthropic_api_key": "",
  "anthropic_model": "claude-sonnet-4-20250514",
};

export class DB {
  private kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  static async open(): Promise<DB> {
    const kv = await Deno.openKv();
    return new DB(kv);
  }

  close(): void {
    this.kv.close();
  }

  async createMeeting(
    title: string,
    meetURL: string,
    authMode: string,
  ): Promise<Meeting> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const meeting: Meeting = {
      id,
      title,
      meet_url: meetURL,
      status: "pending",
      auth_mode: authMode,
      created_at: now,
      updated_at: now,
    };
    const invertedTs = Number.MAX_SAFE_INTEGER - new Date(now).getTime();
    await this.kv.atomic()
      .set(["meetings", id], meeting)
      .set(["meetings_by_date", invertedTs, id], meeting)
      .commit();
    return meeting;
  }

  async getMeeting(id: string): Promise<Meeting | null> {
    const entry = await this.kv.get<Meeting>(["meetings", id]);
    return entry.value;
  }

  async listMeetings(): Promise<Meeting[]> {
    const meetings: Meeting[] = [];
    const iter = this.kv.list<Meeting>({ prefix: ["meetings_by_date"] });
    for await (const entry of iter) {
      meetings.push(entry.value);
    }
    return meetings;
  }

  async updateMeetingStatus(
    id: string,
    status: MeetingStatus,
    errMsg: string | null,
  ): Promise<void> {
    const entry = await this.kv.get<Meeting>(["meetings", id]);
    if (!entry.value) return;
    const meeting = {
      ...entry.value,
      status,
      error_message: errMsg,
      updated_at: new Date().toISOString(),
    };
    const invertedTs = Number.MAX_SAFE_INTEGER -
      new Date(entry.value.created_at).getTime();
    await this.kv.atomic()
      .set(["meetings", id], meeting)
      .set(["meetings_by_date", invertedTs, id], meeting)
      .commit();
  }

  async updateMeetingRecording(
    id: string,
    webmKey: string,
    wavKey: string,
    durationSec: number,
  ): Promise<void> {
    const entry = await this.kv.get<Meeting>(["meetings", id]);
    if (!entry.value) return;
    const meeting = {
      ...entry.value,
      recording_path: webmKey,
      wav_path: wavKey,
      duration_seconds: durationSec,
      updated_at: new Date().toISOString(),
    };
    const invertedTs = Number.MAX_SAFE_INTEGER -
      new Date(entry.value.created_at).getTime();
    await this.kv.atomic()
      .set(["meetings", id], meeting)
      .set(["meetings_by_date", invertedTs, id], meeting)
      .commit();
  }

  async updateMeetingWorkerURL(id: string, workerURL: string): Promise<void> {
    const entry = await this.kv.get<Meeting>(["meetings", id]);
    if (!entry.value) return;
    const meeting = {
      ...entry.value,
      worker_url: workerURL,
      updated_at: new Date().toISOString(),
    };
    const invertedTs = Number.MAX_SAFE_INTEGER -
      new Date(entry.value.created_at).getTime();
    await this.kv.atomic()
      .set(["meetings", id], meeting)
      .set(["meetings_by_date", invertedTs, id], meeting)
      .commit();
  }

  async deleteMeeting(id: string): Promise<void> {
    const entry = await this.kv.get<Meeting>(["meetings", id]);
    if (!entry.value) return;
    const invertedTs = Number.MAX_SAFE_INTEGER -
      new Date(entry.value.created_at).getTime();
    await this.kv.atomic()
      .delete(["meetings", id])
      .delete(["meetings_by_date", invertedTs, id])
      .delete(["transcripts", id])
      .delete(["summaries", id])
      .commit();
  }

  async createTranscript(
    meetingID: string,
    content: string,
    segments: string | null,
    language: string | null,
  ): Promise<Transcript> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const transcript: Transcript = {
      id,
      meeting_id: meetingID,
      content,
      segments,
      language,
      created_at: now,
    };
    await this.kv.set(["transcripts", meetingID], transcript);
    return transcript;
  }

  async getTranscript(meetingID: string): Promise<Transcript | null> {
    const entry = await this.kv.get<Transcript>(["transcripts", meetingID]);
    return entry.value;
  }

  async deleteTranscriptByMeeting(meetingID: string): Promise<void> {
    await this.kv.delete(["transcripts", meetingID]);
  }

  async createSummary(
    meetingID: string,
    content: string,
    model: string,
    promptTemplate: string | null,
  ): Promise<Summary> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const summary: Summary = {
      id,
      meeting_id: meetingID,
      content,
      model,
      prompt_template: promptTemplate,
      created_at: now,
    };
    await this.kv.set(["summaries", meetingID], summary);
    return summary;
  }

  async getSummary(meetingID: string): Promise<Summary | null> {
    const entry = await this.kv.get<Summary>(["summaries", meetingID]);
    return entry.value;
  }

  async deleteSummaryByMeeting(meetingID: string): Promise<void> {
    await this.kv.delete(["summaries", meetingID]);
  }

  async getSettings(): Promise<Record<string, string>> {
    const settings: Record<string, string> = {};
    const iter = this.kv.list<string>({ prefix: ["settings"] });
    for await (const entry of iter) {
      const key = entry.key[1] as string;
      settings[key] = entry.value;
    }

    if (Object.keys(settings).length === 0) {
      for (const [k, v] of Object.entries(SETTINGS_DEFAULTS)) {
        await this.kv.set(["settings", k], v);
        settings[k] = v;
      }
    }

    return settings;
  }

  async updateSettings(settings: Record<string, string>): Promise<void> {
    const op = this.kv.atomic();
    for (const [k, v] of Object.entries(settings)) {
      op.set(["settings", k], v);
    }
    await op.commit();
  }
}

export class Hub {
  private clients = new Set<WebSocket>();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.addEventListener("close", () => {
      this.clients.delete(ws);
    });
    ws.addEventListener("error", () => {
      this.clients.delete(ws);
    });
  }

  broadcast(msg: WSStatusMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch {
          this.clients.delete(ws);
        }
      } else {
        this.clients.delete(ws);
      }
    }
  }
}

export interface Storage {
  put(key: string, localPath: string): Promise<void>;
  getURL(key: string): Promise<string>;
  download(key: string, localPath: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class LocalStorage implements Storage {
  constructor(private baseDir: string) {}

  async put(_key: string, _localPath: string): Promise<void> {
    // no-op: files are already in place
  }

  async getURL(_key: string): Promise<string> {
    return "";
  }

  async download(key: string, localPath: string): Promise<void> {
    const src = join(this.baseDir, basename(key));
    if (src === localPath) return;
    await Deno.copyFile(src, localPath);
  }

  async delete(key: string): Promise<void> {
    try {
      await Deno.remove(join(this.baseDir, basename(key)));
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
}

export class S3Storage implements Storage {
  private client: Minio.Client;
  private bucket: string;

  constructor(
    endpoint: string,
    accessKey: string,
    secretKey: string,
    bucket: string,
    region: string,
  ) {
    const useSSL = endpoint.startsWith("https://");
    const cleanEndpoint = endpoint
      .replace(/^https:\/\//, "")
      .replace(/^http:\/\//, "");

    this.client = new Minio.Client({
      endPoint: cleanEndpoint,
      accessKey,
      secretKey,
      useSSL,
      region,
    });
    this.bucket = bucket;
  }

  async put(key: string, localPath: string): Promise<void> {
    const stat = await Deno.stat(localPath);
    let contentType = "application/octet-stream";
    if (key.endsWith(".webm")) contentType = "video/webm";
    else if (key.endsWith(".wav")) contentType = "audio/wav";

    await this.client.fPutObject(this.bucket, key, localPath, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
    });
    console.log(`storage: uploaded ${key} (${stat.size} bytes)`);
  }

  async getURL(key: string): Promise<string> {
    return await this.client.presignedGetObject(this.bucket, key, 3600);
  }

  async download(key: string, localPath: string): Promise<void> {
    await this.client.fGetObject(this.bucket, key, localPath);
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }
}

function initStorage(config: Config): Storage {
  const storageType = Deno.env.get("STORAGE_TYPE");
  if (storageType === "s3") {
    console.log("storage: using S3");
    return new S3Storage(
      Deno.env.get("S3_ENDPOINT") || "",
      Deno.env.get("S3_ACCESS_KEY") || "",
      Deno.env.get("S3_SECRET_KEY") || "",
      Deno.env.get("S3_BUCKET") || "gubgub-recordings",
      Deno.env.get("S3_REGION") || "auto",
    );
  }
  console.log("storage: using local filesystem");
  return new LocalStorage(config.recordingsDir);
}

export interface TranscribeConfig {
  provider: string;
}

export class WorkerClient {
  constructor(private baseURL: string) {}

  async createSession(sessionID: string): Promise<WorkerSessionStatus> {
    const resp = await fetch(`${this.baseURL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionID }),
      signal: AbortSignal.timeout(30_000),
    });
    const status: WorkerSessionStatus = await resp.json();
    if (resp.status >= 400) {
      throw new Error(`create session: ${status.error}`);
    }
    return status;
  }

  async joinMeeting(
    sessionID: string,
    req: WorkerJoinRequest,
  ): Promise<WorkerSessionStatus> {
    const resp = await fetch(
      `${this.baseURL}/api/sessions/${sessionID}/join`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const status: WorkerSessionStatus = await resp.json();
    if (resp.status >= 400) {
      throw new Error(`join meeting: ${status.error}`);
    }
    return status;
  }

  async getStatus(sessionID: string): Promise<WorkerSessionStatus> {
    const resp = await fetch(
      `${this.baseURL}/api/sessions/${sessionID}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    const status: WorkerSessionStatus = await resp.json();
    if (resp.status >= 400) {
      throw new Error(`get status: ${status.error}`);
    }
    return status;
  }

  async stopSession(sessionID: string): Promise<WorkerSessionStatus> {
    const resp = await fetch(
      `${this.baseURL}/api/sessions/${sessionID}/stop`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
      },
    );
    return await resp.json();
  }

  async deleteSession(sessionID: string): Promise<void> {
    await fetch(`${this.baseURL}/api/sessions/${sessionID}`, {
      method: "DELETE",
      signal: AbortSignal.timeout(30_000),
    }).catch(() => {});
  }

  async startLogin(sessionID: string, profileName: string): Promise<void> {
    const resp = await fetch(
      `${this.baseURL}/api/sessions/${sessionID}/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_name: profileName }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (resp.status >= 400) {
      throw new Error(`start login: status ${resp.status}`);
    }
  }

  async health(): Promise<void> {
    const resp = await fetch(`${this.baseURL}/api/health`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (resp.status !== 200) {
      throw new Error(`health check: status ${resp.status}`);
    }
  }

  async transcribe(
    sessionID: string,
    config: TranscribeConfig,
  ): Promise<TranscribeResult> {
    const resp = await fetch(
      `${this.baseURL}/api/sessions/${sessionID}/transcribe`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
        signal: AbortSignal.timeout(30 * 60 * 1000),
      },
    );
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`transcribe: ${resp.status}: ${body}`);
    }
    return await resp.json();
  }
}

export const DEFAULT_SUMMARY_PROMPT =
  `You are a meeting summarizer. Given the following meeting transcript, provide:

1) **Key Topics Discussed** - List the main topics covered
2) **Action Items** - List any action items with owners if mentioned
3) **Decisions Made** - List key decisions that were reached
4) **Brief Summary** - A concise 3-5 sentence summary of the meeting

Transcript:
%s`;

function buildPrompt(
  transcript: string,
  promptTemplate: string | null,
): string {
  if (promptTemplate && promptTemplate !== "") {
    if (promptTemplate.includes("%s")) {
      return promptTemplate.replace("%s", transcript);
    }
    return promptTemplate + "\n\nTranscript:\n" + transcript;
  }
  return DEFAULT_SUMMARY_PROMPT.replace("%s", transcript);
}

async function summarizeOllama(
  ollamaURL: string,
  model: string,
  transcript: string,
  promptTemplate: string | null,
): Promise<string> {
  console.log(`summarize: using model ${model} at ${ollamaURL}`);

  const prompt = buildPrompt(transcript, promptTemplate);

  const resp = await fetch(`${ollamaURL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ollama returned ${resp.status}: ${body}`);
  }

  const result = await resp.json() as { response: string };
  console.log(`summarize: completed (${result.response.length} chars)`);
  return result.response;
}

async function summarizeOpenAI(
  baseURL: string,
  apiKey: string,
  model: string,
  transcript: string,
  promptTemplate: string | null,
): Promise<string> {
  console.log(`summarizeOpenAI: using model ${model} at ${baseURL}`);

  const prompt = buildPrompt(transcript, promptTemplate);

  const resp = await fetch(`${baseURL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`openai returned ${resp.status}: ${body}`);
  }

  const result = await resp.json() as {
    choices: { message: { content: string } }[];
  };

  if (!result.choices || result.choices.length === 0) {
    throw new Error("openai returned no choices");
  }

  const text = result.choices[0].message.content;
  console.log(`summarizeOpenAI: completed (${text.length} chars)`);
  return text;
}

async function summarizeAnthropic(
  apiKey: string,
  model: string,
  transcript: string,
  promptTemplate: string | null,
): Promise<string> {
  console.log(`summarizeAnthropic: using model ${model}`);

  const prompt = buildPrompt(transcript, promptTemplate);

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`anthropic returned ${resp.status}: ${body}`);
  }

  const result = await resp.json() as {
    content: { type: string; text: string }[];
  };

  let text = "";
  for (const c of result.content) {
    if (c.type === "text") text += c.text;
  }

  if (!text) {
    throw new Error("anthropic returned no text content");
  }

  console.log(`summarizeAnthropic: completed (${text.length} chars)`);
  return text;
}

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function buildAuthURL(config: Config, state: string): string {
  const params = new URLSearchParams({
    client_id: config.googleClientID,
    redirect_uri: config.googleRedirectURL,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeCode(
  config: Config,
  code: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientID,
      client_secret: config.googleClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.googleRedirectURL,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`token exchange failed: ${resp.status} ${body}`);
  }

  return await resp.json();
}

export async function fetchUserInfo(
  accessToken: string,
): Promise<{ email: string }> {
  const resp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new Error("failed to get userinfo");
  return await resp.json();
}

async function refreshTokenIfNeeded(
  db: DB,
  config: Config,
): Promise<string> {
  const settings = await db.getSettings();
  const refreshToken = settings["google_oauth_refresh_token"];
  const accessToken = settings["google_oauth_access_token"];
  const expiryStr = settings["google_oauth_expiry"];

  if (!refreshToken) throw new Error("google account not connected");

  if (accessToken && expiryStr) {
    const expiry = new Date(expiryStr).getTime();
    if (Date.now() < expiry - 5 * 60 * 1000) {
      return accessToken;
    }
  }

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.googleClientID,
      client_secret: config.googleClientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`token refresh failed: ${resp.status} ${body}`);
  }

  const data = await resp.json() as {
    access_token: string;
    expires_in: number;
  };

  const newExpiry = new Date(
    Date.now() + data.expires_in * 1000,
  ).toISOString();

  await db.updateSettings({
    "google_oauth_access_token": data.access_token,
    "google_oauth_expiry": newExpiry,
  });

  return data.access_token;
}

function extractMeetURL(event: {
  conferenceData?: {
    entryPoints?: { entryPointType: string; uri: string }[];
  };
  hangoutLink?: string;
}): string {
  if (event.conferenceData?.entryPoints) {
    for (const ep of event.conferenceData.entryPoints) {
      if (ep.entryPointType === "video") return ep.uri;
    }
  }
  return event.hangoutLink || "";
}

export async function listUpcomingMeetEvents(
  db: DB,
  config: Config,
): Promise<CalendarEvent[]> {
  const accessToken = await refreshTokenIfNeeded(db, config);

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    conferenceDataVersion: "1",
  });

  const resp = await fetch(`${GOOGLE_CALENDAR_URL}?${params}`, {
    headers: { "Authorization": `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`list events failed: ${resp.status} ${body}`);
  }

  const data = await resp.json() as {
    items: {
      id: string;
      summary: string;
      start: { dateTime?: string; date?: string };
      end: { dateTime?: string; date?: string };
      organizer?: { email: string };
      description?: string;
      conferenceData?: {
        entryPoints?: { entryPointType: string; uri: string }[];
      };
      hangoutLink?: string;
    }[];
  };

  const result: CalendarEvent[] = [];
  for (const item of data.items || []) {
    const meetURL = extractMeetURL(item);
    if (!meetURL) continue;

    result.push({
      id: item.id,
      title: item.summary || "",
      start: item.start.dateTime || item.start.date || "",
      end: item.end.dateTime || item.end.date || "",
      meet_url: meetURL,
      organizer: item.organizer?.email || "",
      description: item.description,
    });
  }

  return result;
}

export interface WorkerHandle {
  [key: string]: unknown;
}

export interface WorkerStartOpts {
  port: number;
  recordingsDir: string;
  profilesDir: string;
  headless: boolean;
  chromePath?: string;
  env?: Record<string, string>;
}

export interface WorkerProvider {
  readonly name: string;
  start(opts: WorkerStartOpts): Promise<WorkerHandle>;
  stop(handle: WorkerHandle): Promise<void>;
}

const LOG_BUFFER_SIZE = 500;

export class WorkerLogs {
  private buffers = new Map<string, string[]>();
  private listeners = new Map<string, Set<(line: string) => void>>();

  push(workerId: string, line: string): void {
    let buf = this.buffers.get(workerId);
    if (!buf) {
      buf = [];
      this.buffers.set(workerId, buf);
    }
    buf.push(line);
    if (buf.length > LOG_BUFFER_SIZE) buf.shift();

    const subs = this.listeners.get(workerId);
    if (subs) {
      for (const fn of subs) fn(line);
    }
  }

  get(workerId: string): string[] {
    return this.buffers.get(workerId) || [];
  }

  subscribe(workerId: string, fn: (line: string) => void): () => void {
    let subs = this.listeners.get(workerId);
    if (!subs) {
      subs = new Set();
      this.listeners.set(workerId, subs);
    }
    subs.add(fn);
    return () => {
      subs!.delete(fn);
      if (subs!.size === 0) this.listeners.delete(workerId);
    };
  }

  remove(workerId: string): void {
    this.buffers.delete(workerId);
    this.listeners.delete(workerId);
  }
}

export const workerLogs = new WorkerLogs();

export class LocalProvider implements WorkerProvider {
  readonly name = "local";

  constructor(private workerDir: string, private workerBinary: string) {}

  async start(opts: WorkerStartOpts): Promise<WorkerHandle> {
    const parentEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(Deno.env.toObject())) {
      parentEnv[k] = v;
    }

    const env: Record<string, string> = {
      ...parentEnv,
      PORT: String(opts.port),
      RECORDINGS_DIR: resolve(opts.recordingsDir),
      PROFILES_DIR: resolve(opts.profilesDir),
      HEADLESS: String(opts.headless),
      ...opts.env,
    };
    if (opts.chromePath) env.CHROME_PATH = opts.chromePath;

    let cmd: string[];
    let cwd: string;
    if (this.workerBinary) {
      cmd = [this.workerBinary];
      cwd = resolve(opts.recordingsDir, "..");
    } else {
      cwd = resolve(opts.env?.["WWW_DIR"] || Deno.cwd(), this.workerDir);
      const binaryPath = join(cwd, "worker");
      try {
        Deno.statSync(binaryPath);
        cmd = [binaryPath];
      } catch {
        cmd = ["go", "run", "."];
      }
    }

    const command = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      cwd,
      env,
      stdout: "piped",
      stderr: "piped",
    });

    const process = command.spawn();

    return {
      process,
      pid: process.pid,
      stdout: process.stdout,
      stderr: process.stderr,
    };
  }

  async stop(handle: WorkerHandle): Promise<void> {
    const process = handle.process as Deno.ChildProcess;
    try {
      process.kill("SIGTERM");
    } catch {
      // already exited
    }
    await process.status.catch(() => {});
  }
}

export class RemoteProvider implements WorkerProvider {
  readonly name = "remote";

  constructor(private workerURL: string) {}

  async start(_opts: WorkerStartOpts): Promise<WorkerHandle> {
    return { url: this.workerURL };
  }

  async stop(_handle: WorkerHandle): Promise<void> {
    // no-op
  }
}

export class Orchestrator {
  private workers = new Map<
    string,
    { info: ManagedWorker; handle: WorkerHandle }
  >();
  private nextPort: number;

  constructor(private config: Config, private provider: WorkerProvider) {
    this.nextPort = config.workerPortStart;
  }

  async start(): Promise<ManagedWorker> {
    const port = this.nextPort++;
    const id = crypto.randomUUID();
    const url = `http://localhost:${port}`;

    const handle = await this.provider.start({
      port,
      recordingsDir: this.config.recordingsDir,
      profilesDir: this.config.profilesDir,
      headless: this.config.workerHeadless,
      chromePath: this.config.workerChromePath || undefined,
    });

    const h = handle as Record<string, unknown>;
    if (h.stdout) {
      this.pipeToLogs(id, h.stdout as ReadableStream<Uint8Array>, port);
    }
    if (h.stderr) {
      this.pipeToLogs(id, h.stderr as ReadableStream<Uint8Array>, port);
    }

    const client = new WorkerClient(url);
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      try {
        await client.health();
        healthy = true;
        break;
      } catch {
        await delay(1000);
      }
    }

    if (!healthy) {
      const recentLogs = workerLogs.get(id).slice(-20).join("\n");
      await this.provider.stop(handle).catch(() => {});
      workerLogs.remove(id);
      const detail = recentLogs ? `\n\nWorker output:\n${recentLogs}` : "";
      throw new Error(
        `worker on port ${port} failed to start within 30s${detail}`,
      );
    }

    const info: ManagedWorker = {
      id,
      url,
      providerName: this.provider.name,
      port,
      startedAt: new Date().toISOString(),
      meta: { pid: (handle as Record<string, unknown>).pid },
    };

    this.workers.set(id, { info, handle });
    console.log(
      `orchestrator: started worker ${id} on port ${port} (${this.provider.name})`,
    );
    return info;
  }

  async stop(id: string): Promise<void> {
    const entry = this.workers.get(id);
    if (!entry) throw new Error(`worker ${id} not found`);

    await this.provider.stop(entry.handle);
    this.workers.delete(id);
    workerLogs.remove(id);
    console.log(`orchestrator: stopped worker ${id}`);
  }

  async stopIfIdle(workerURL: string): Promise<void> {
    let targetId: string | null = null;
    for (const [id, entry] of this.workers) {
      if (entry.info.url === workerURL) {
        targetId = id;
        break;
      }
    }
    if (!targetId) return;

    try {
      const resp = await fetch(`${workerURL}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const sessions = data.active_sessions || 0;
        if (sessions > 0) {
          console.log(
            `orchestrator: worker ${targetId} still has ${sessions} active session(s), keeping alive`,
          );
          return;
        }
      }
    } catch {
      // Worker might already be dead — clean up anyway
    }

    console.log(`orchestrator: auto-stopping idle worker ${targetId}`);
    await this.stop(targetId).catch((err) => {
      console.error(
        `orchestrator: error auto-stopping worker ${targetId}:`,
        err,
      );
    });
  }

  acquire(): string {
    if (this.workers.size > 0) {
      const first = this.workers.values().next().value!;
      return first.info.url;
    }
    return this.config.workerURL;
  }

  list(): ManagedWorker[] {
    const managed = [...this.workers.values()].map((e) => e.info);

    const extURL = this.config.workerURL;
    if (extURL && !managed.some((w) => w.url === extURL)) {
      const port = parseInt(new URL(extURL).port) || 80;
      managed.push({
        id: "external",
        url: extURL,
        providerName: "external",
        port,
        startedAt: "",
      });
    }

    return managed;
  }

  get(id: string): ManagedWorker | undefined {
    if (id === "external") {
      const extURL = this.config.workerURL;
      if (!extURL) return undefined;
      const port = parseInt(new URL(extURL).port) || 80;
      return {
        id: "external",
        url: extURL,
        providerName: "external",
        port,
        startedAt: "",
      };
    }
    return this.workers.get(id)?.info;
  }

  private async pipeToLogs(
    id: string,
    stream: ReadableStream<Uint8Array>,
    port: number,
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const prefix = `[worker:${port}]`;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        for (const line of text.split("\n")) {
          if (line) {
            console.log(`${prefix} ${line}`);
            workerLogs.push(id, line);
          }
        }
      }
    } catch {
      // stream closed
    }
  }

  async stopAll(): Promise<void> {
    const ids = [...this.workers.keys()];
    for (const id of ids) {
      await this.stop(id).catch((err) => {
        console.error(`orchestrator: error stopping worker ${id}:`, err);
      });
    }
  }
}

async function remuxWebM(path: string): Promise<void> {
  const tmp = path + ".remux.webm";
  try {
    const cmd = new Deno.Command("ffmpeg", {
      args: ["-y", "-i", path, "-c", "copy", tmp],
      stdout: "null",
      stderr: "null",
    });
    const result = await cmd.output();
    if (result.success) {
      await Deno.rename(tmp, path);
      console.log(`pipeline: remuxed ${basename(path)} for seeking`);
    } else {
      await Deno.remove(tmp).catch(() => {});
      console.log("pipeline: ffmpeg remux failed, video may not be seekable");
    }
  } catch {
    console.log("pipeline: ffmpeg not available, skipping remux");
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

export class Pipeline {
  private active = new Map<string, AbortController>();

  constructor(
    private db: DB,
    private config: Config,
    private hub: Hub,
    private storage: Storage,
    private orchestrator: Orchestrator,
  ) {}

  get defaultSummaryPrompt(): string {
    return DEFAULT_SUMMARY_PROMPT;
  }

  private async setStatus(
    meetingID: string,
    status: MeetingStatus,
    errMsg: string | null,
  ): Promise<void> {
    await this.db.updateMeetingStatus(meetingID, status, errMsg);
    this.hub.broadcast({
      type: "status",
      meeting_id: meetingID,
      status,
    });
  }

  private async setError(meetingID: string, err: Error): Promise<void> {
    await this.setStatus(meetingID, "failed", err.message);
  }

  private async workerForMeeting(meetingID: string): Promise<WorkerClient> {
    const m = await this.db.getMeeting(meetingID);
    if (m?.worker_url) {
      return new WorkerClient(m.worker_url);
    }
    return new WorkerClient(this.config.workerURL);
  }

  async stop(meetingID: string): Promise<void> {
    const ac = this.active.get(meetingID);
    if (ac) ac.abort();

    const worker = await this.workerForMeeting(meetingID);
    worker.stopSession(meetingID).catch(() => {});

    this.active.delete(meetingID);
    await this.setStatus(meetingID, "failed", "stopped by user");
  }

  async recoverStaleMeetings(): Promise<void> {
    const activeStatuses: MeetingStatus[] = [
      "joining",
      "recording",
      "processing",
      "transcribing",
      "summarizing",
    ];
    const meetings = await this.db.listMeetings();
    let recovered = 0;
    for (const m of meetings) {
      if (!activeStatuses.includes(m.status)) continue;
      if (this.active.has(m.id)) continue;
      await this.setStatus(
        m.id,
        "failed",
        "interrupted — worker lost or server restarted",
      );
      recovered++;
    }
    if (recovered > 0) {
      console.log(`pipeline: recovered ${recovered} stale meeting(s)`);
    }
  }

  run(meetingID: string): void {
    this._run(meetingID).catch((err) => {
      console.error(`pipeline: unhandled error for ${meetingID}:`, err);
    });
  }

  private async _run(meetingID: string): Promise<void> {
    const ac = new AbortController();
    this.active.set(meetingID, ac);
    const signal = ac.signal;

    const workerURL = this.orchestrator.acquire();
    const worker = new WorkerClient(workerURL);
    await this.db.updateMeetingWorkerURL(meetingID, workerURL);

    const cleanup = () => {
      ac.abort();
      this.active.delete(meetingID);
      worker.deleteSession(meetingID).catch(() => {});
      this.orchestrator.stopIfIdle(workerURL).catch(() => {});
    };

    try {
      const meeting = await this.db.getMeeting(meetingID);
      if (!meeting) {
        console.log(`pipeline: meeting ${meetingID} not found`);
        return;
      }

      await this.setStatus(meetingID, "joining", null);

      await worker.createSession(meetingID);

      const joinReq: WorkerJoinRequest = {
        meet_url: meeting.meet_url,
        display_name: "gubgub",
        auth_mode: meeting.auth_mode,
      };

      if (meeting.auth_mode === "account") {
        const settings = await this.db.getSettings();
        joinReq.google_email = settings["google_email"];
        joinReq.google_password = settings["google_password"];
        if (!joinReq.google_email || !joinReq.google_password) {
          await this.setError(
            meetingID,
            new Error("google credentials not configured"),
          );
          return;
        }
      }

      await worker.joinMeeting(meetingID, joinReq);

      let webmPath = "";
      let wavPath = "";
      let pollFailures = 0;
      const MAX_POLL_FAILURES = 10;

      while (!signal.aborted) {
        await delay(3000, signal).catch(() => {});
        if (signal.aborted) return;

        let status;
        try {
          status = await worker.getStatus(meetingID);
          pollFailures = 0;
        } catch (err) {
          pollFailures++;
          console.log(
            `pipeline: poll error (${pollFailures}/${MAX_POLL_FAILURES}): ${err}`,
          );
          if (pollFailures >= MAX_POLL_FAILURES) {
            await this.setError(
              meetingID,
              new Error("lost connection to worker"),
            );
            return;
          }
          continue;
        }

        switch (status.status) {
          case "joining":
          case "waiting_admission":
            await this.setStatus(meetingID, "joining", null);
            break;
          case "recording":
            await this.setStatus(meetingID, "recording", null);
            break;
          case "ended":
          case "stopped":
            webmPath = status.webm_path || "";
            wavPath = status.wav_path || "";
            break;
          case "failed":
            await this.setError(
              meetingID,
              new Error(`worker: ${status.error}`),
            );
            return;
        }

        if (webmPath || wavPath) break;
      }

      if (signal.aborted) return;

      if (!webmPath || !wavPath) {
        await this.setError(
          meetingID,
          new Error("worker ended without recording files"),
        );
        return;
      }

      // TODO: move remuxing to the worker
      const localWebm = join(this.config.recordingsDir, basename(webmPath));
      await remuxWebM(localWebm);

      await this.db.updateMeetingRecording(meetingID, webmPath, wavPath, 0);
      await this.setStatus(meetingID, "transcribing", null);

      const settings = await this.db.getSettings();
      const transcriptionProvider = settingOrConfig(
        settings,
        "transcription_provider",
        this.config.transcriptionProvider,
      );

      const result = await worker.transcribe(meetingID, {
        provider: transcriptionProvider,
      });

      await this.db.createTranscript(
        meetingID,
        result.text,
        result.segments,
        result.language,
      );
      this.summarize(meetingID, result.text, null);
    } catch (err) {
      if (!signal.aborted) {
        await this.setError(
          meetingID,
          err instanceof Error ? err : new Error(String(err)),
        );
      }
    } finally {
      cleanup();
    }
  }

  summarize(
    meetingID: string,
    transcriptText: string,
    promptTemplate: string | null,
  ): void {
    this._summarize(meetingID, transcriptText, promptTemplate).catch((err) => {
      console.error(`pipeline: summarize error for ${meetingID}:`, err);
    });
  }

  private async _summarize(
    meetingID: string,
    transcriptText: string,
    promptTemplate: string | null,
  ): Promise<void> {
    await this.setStatus(meetingID, "summarizing", null);

    const settings = await this.db.getSettings();
    const provider = settingOrConfig(
      settings,
      "summarization_provider",
      this.config.summarizationProvider,
    );

    let summaryText: string;
    let model: string;

    switch (provider) {
      case "openai": {
        const apiURL = settingOrConfig(
          settings,
          "openai_api_url",
          this.config.openAIAPIURL,
        );
        const apiKey = settingOrConfig(
          settings,
          "openai_api_key",
          this.config.openAIAPIKey,
        );
        model = settingOrConfig(
          settings,
          "openai_model",
          this.config.openAIModel,
        );
        summaryText = await summarizeOpenAI(
          apiURL,
          apiKey,
          model,
          transcriptText,
          promptTemplate,
        );
        break;
      }
      case "anthropic": {
        const apiKey = settingOrConfig(
          settings,
          "anthropic_api_key",
          this.config.anthropicAPIKey,
        );
        model = settingOrConfig(
          settings,
          "anthropic_model",
          this.config.anthropicModel,
        );
        summaryText = await summarizeAnthropic(
          apiKey,
          model,
          transcriptText,
          promptTemplate,
        );
        break;
      }
      default: {
        const ollamaURL = settingOrConfig(
          settings,
          "ollama_url",
          this.config.ollamaURL,
        );
        model = settingOrConfig(
          settings,
          "ollama_model",
          this.config.ollamaModel,
        );
        summaryText = await summarizeOllama(
          ollamaURL,
          model,
          transcriptText,
          promptTemplate,
        );
        break;
      }
    }

    await this.db.createSummary(meetingID, summaryText, model, promptTemplate);
    await this.setStatus(meetingID, "done", null);
  }
}

export interface AppContext {
  config: Config;
  db: DB;
  hub: Hub;
  storage: Storage;
  workerClient: WorkerClient;
  pipeline: Pipeline;
  orchestrator: Orchestrator;
}

let ctx: AppContext | null = null;

export async function getContext(): Promise<AppContext> {
  if (ctx) return ctx;

  const config = loadConfig();
  const db = await DB.open();
  const hub = new Hub();
  const storage = initStorage(config);
  const workerClient = new WorkerClient(config.workerURL);

  const isDeployed = !!Deno.env.get("DENO_DEPLOYMENT_ID");

  const provider = isDeployed
    ? new RemoteProvider(config.workerURL)
    : new LocalProvider(config.workerDir, config.workerBinary);
  const orchestrator = new Orchestrator(config, provider);

  const pipeline = new Pipeline(db, config, hub, storage, orchestrator);

  ctx = { config, db, hub, storage, workerClient, pipeline, orchestrator };

  pipeline.recoverStaleMeetings().catch((err) => {
    console.error("failed to recover stale meetings:", err);
  });

  if (!isDeployed && config.autoStartWorker) {
    orchestrator.start().then((w) => {
      console.log(`auto-started worker: ${w.url}`);
    }).catch((err) => {
      console.error("failed to auto-start worker:", err);
    });
  }

  if (!isDeployed) {
    const shutdown = () => {
      console.log("shutting down managed workers...");
      orchestrator.stopAll().then(() => {
        console.log("all managed workers stopped.");
        Deno.exit(0);
      }).catch((err) => {
        console.error("error stopping workers:", err);
        Deno.exit(1);
      });
    };

    Deno.addSignalListener("SIGINT", shutdown);
    Deno.addSignalListener("SIGTERM", shutdown);
  }

  return ctx;
}

export interface SessionUser {
  email: string;
  isAdmin: boolean;
}

const SESSION_COOKIE = "gub_session";
const encoder = new TextEncoder();

async function getSessionSecret(db: DB): Promise<CryptoKey> {
  const settings = await db.getSettings();
  let raw = settings["session_secret"];
  if (!raw) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    raw = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    await db.updateSettings({ session_secret: raw });
  }
  const keyBytes = encoder.encode(raw);
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signSession(db: DB, email: string): Promise<string> {
  const key = await getSessionSecret(db);
  const data = encoder.encode(email);
  const sig = await crypto.subtle.sign("HMAC", key, data);
  const sigHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${btoa(email)}.${sigHex}`;
}

async function verifySession(db: DB, cookie: string): Promise<string | null> {
  const dot = cookie.indexOf(".");
  if (dot === -1) return null;
  try {
    const email = atob(cookie.slice(0, dot));
    const sigHex = cookie.slice(dot + 1);
    const sigBytes = new Uint8Array(
      sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)),
    );
    const key = await getSessionSecret(db);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(email),
    );
    return valid ? email : null;
  } catch {
    return null;
  }
}

export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

export async function getSessionUser(
  req: Request,
  db: DB,
  config: Config,
): Promise<SessionUser | null> {
  const cookieHeader = req.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const email = await verifySession(db, token);
  if (!email) return null;
  return {
    email,
    isAdmin: email.toLowerCase() === config.adminEmail.toLowerCase(),
  };
}

export async function isEmailAllowed(
  db: DB,
  config: Config,
  email: string,
): Promise<boolean> {
  if (
    config.adminEmail && email.toLowerCase() === config.adminEmail.toLowerCase()
  ) {
    return true;
  }
  const settings = await db.getSettings();
  const domain = settings["allowed_domain"] || "";
  const emails = settings["allowed_emails"] || "";
  if (domain && email.toLowerCase().endsWith("@" + domain.toLowerCase())) {
    return true;
  }
  if (emails) {
    const list = emails.split(",").map((e) => e.trim().toLowerCase());
    if (list.includes(email.toLowerCase())) return true;
  }
  return false;
}

export async function createSessionCookie(
  db: DB,
  email: string,
): Promise<string> {
  const value = await signSession(db, email);
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
