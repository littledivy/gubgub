# Architecture

## Overview

gubgub is two processes: a Deno Fresh web app (`www/`) and a Go worker
(top-level `main.go` + `quirks.go`). The web app serves the UI, manages state in
Deno KV, and orchestrates recordings. The worker drives headless Chrome to join
Google Meet and capture media.

In compiled mode, both are bundled into a single `gubgub` binary via
`deno compile`. The Go worker binary is embedded with `--include` and extracted
to `~/.gubgub/bin/worker` on first run.

## lib.ts

Everything server-side lives in one file. It exports:

- **Config** (`loadConfig`): reads env vars with defaults. The compiled binary's
  `cli.ts` sets these from `config.toml` before anything else runs.
- **DB**: Deno KV wrapper. Meetings are stored under `["meetings", id]` and
  `["meetings_by_date", invertedTimestamp, id]` for reverse-chronological
  listing. Settings, transcripts, and summaries have their own key prefixes.
- **Hub**: WebSocket broadcast to connected browsers for live status updates.
- **Storage**: `LocalStorage` (files on disk) or `S3Storage` (MinIO client).
  Selected by `STORAGE_TYPE` env var.
- **WorkerClient**: HTTP client for the Go worker's REST API.
- **Orchestrator**: Manages worker process lifecycle. `LocalProvider` spawns the
  Go binary as a child process; `RemoteProvider` wraps an external URL. Workers
  are health-checked for up to 30 seconds on startup.
- **Pipeline**: The recording pipeline. Creates a session, joins the meeting via
  the worker, polls for status, triggers transcription and summarization when
  recording ends.
- **Session/Auth**: HMAC-signed cookies. `getSessionUser` validates the cookie
  on each request.

`getContext()` is the singleton that wires everything together. It's called
lazily on first request.

## Compiled binary (cli.ts)

The binary is produced by `deno compile` with
`--include bin --include _fresh --include static`. At startup:

1. Parse CLI args (`--port`, `--data-dir`)
2. Load `~/.gubgub/config.toml` → set env vars (env vars take priority over
   config)
3. Extract the embedded Go worker binary to `~/.gubgub/bin/worker` (skipped if
   version matches)
4. Create data dirs (`~/.gubgub/data/recordings`,
   `~/.gubgub/data/chrome-profiles`)
5. Set env vars that `lib.ts` reads (`WORKER_BINARY`, `RECORDINGS_DIR`, etc.)
6. Construct Fresh server context and start serving

### Worker cwd in compiled mode

`LocalProvider.start()` needs a `cwd` for the child process. Normally it
resolves `..` relative to the www directory (the repo root where `main.go`
lives). When `workerBinary` is set (compiled mode), the cwd is set to the
recordings dir parent instead.

## Config precedence

CLI flags > environment variables > `config.toml` > defaults in `lib.ts`

The config file (`~/.gubgub/config.toml`) is read early and sets env vars only
if they aren't already set. CLI flags like `--port` override everything.

## Worker protocol

The Go worker exposes a REST API:

- `POST /api/sessions` — create a session
- `POST /api/sessions/:id/join` — join a meeting (navigates Chrome)
- `GET /api/sessions/:id` — poll status (`joining`, `recording`, `ended`,
  `failed`)
- `POST /api/sessions/:id/stop` — stop recording
- `POST /api/sessions/:id/transcribe` — transcribe the recording
- `DELETE /api/sessions/:id` — clean up
- `GET /api/health` — health check (returns `active_sessions` count)

The web app polls `GET /api/sessions/:id` every 3 seconds during a recording.
After 10 consecutive poll failures, the meeting is marked failed.

## Pipeline flow

1. User creates a meeting (title + Google Meet URL)
2. Pipeline starts: orchestrator spawns a worker (or reuses one)
3. Worker creates a Chrome session, navigates to Meet, joins
4. Status polling loop: `joining` → `recording` → `ended`
5. On end: remux WebM with ffmpeg (adds seek index), transcribe, summarize
6. Idle workers are auto-stopped after their sessions end

Stale meetings (stuck in active states from a crash) are recovered to `failed`
on startup.

## Storage

Two backends selected by `STORAGE_TYPE`:

- **local** (default): files written directly by the worker to `RECORDINGS_DIR`.
  `LocalStorage.put()` is a no-op since files are already in place.
- **s3**: uses the MinIO client. Any S3-compatible endpoint works (AWS, R2,
  MinIO).

## Deno Deploy

On Deploy (`DENO_DEPLOYMENT_ID` is set), the app uses `RemoteProvider` instead
of `LocalProvider` — it doesn't try to spawn workers. The worker must run on a
separate machine with Chrome. S3 storage is required since there's no shared
filesystem.

## Building

`make` builds the Go worker, Fresh static assets, and compiles the single
binary:

```
make          → dist/gubgub (current platform)
make release  → dist/gubgub-{darwin,linux}-{arm64,amd64}
make clean    → removes dist/, www/bin/, www/_fresh/
```

The Go worker is built with `CGO_ENABLED=0` for static linking and
`-ldflags="-s -w"` to strip debug info. It's staged to `www/bin/worker` so
`deno compile --include bin` picks it up.
