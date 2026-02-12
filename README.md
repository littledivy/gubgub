# gubgub - Self-hosted meeting recorder and summarization

### How it works

gubgub is two processes: a **web app** (`www/`) that serves the UI and
orchestrates the pipeline, and a **Go worker** (`main.go`) that drives a
headless Chrome instance to join and record Google Meet sessions.

When you start a recording, the web app spawns a worker process, which navigates
Chrome into the meeting and captures media. Once the meeting ends (or you stop
it), the pipeline kicks in: audio is extracted with ffmpeg, transcribed with
Whisper (local CLI or OpenAI API), and summarized by Ollama, OpenAI, or
Anthropic. Status updates stream to the browser over WebSocket.

```
browser ──▶ www (Deno Fresh :3000)
              │
              ├── Deno KV (meetings, transcripts, summaries)
              ├── Storage (local disk or S3)
              │
              └── spawns ──▶ worker (Go :8089+)
                               │
                               └── headless Chrome ──▶ Google Meet
```

## Self-hosting

### Single binary (recommended)

Download the latest release for your platform:

```bash
# Install script (macOS / Linux)
curl -fsSL https://raw.githubusercontent.com/littledivy/gubgub/dev/install | bash
```

Or download manually from
[Releases](https://github.com/littledivy/gubgub/releases).

Then run:

```bash
gubgub
```

That's it. On first run gubgub creates `~/.gubgub/` with a default config and
extracts the embedded worker binary. The app is at `http://localhost:3000`.

Edit `~/.gubgub/config.toml` to configure AI providers, Google Calendar, etc:

```toml
[summarization]
provider = "anthropic"
anthropic_api_key = "sk-ant-..."

[transcription]
provider = "openai"
openai_api_key = "sk-..."
```

CLI options:

```
gubgub --port 4000              # custom port
gubgub --data-dir /tmp/gubgub   # custom data directory
```

## Deno Deploy (experimental)

gubgub can run on [Deno Deploy](https://deno.com/deploy) for the web app
portion. The worker (headless Chrome) cannot run on Deploy, so you need a
separate machine for running the worker.

1. **Deploy the web app:**

   ```bash
   cd www
   deno deploy
   ```

   Or link the repo in the Deno Deploy dashboard.

2. **Run the worker on a separate machine** (needs Chrome installed):

   ```bash
   go build -o worker .
   RECORDINGS_DIR=/data/recordings PORT=8089 ./worker
   ```

3. **Configure the deployed app** to point at your worker via environment
   variables in the Deploy dashboard:

   | Variable        | Value                           |
   | --------------- | ------------------------------- |
   | `WORKER_URL`    | `https://your-worker-host:8089` |
   | `STORAGE_TYPE`  | `s3`                            |
   | `S3_BUCKET`     | your bucket name                |
   | `S3_ENDPOINT`   | your S3/R2 endpoint             |
   | `S3_ACCESS_KEY` | access key                      |
   | `S3_SECRET_KEY` | secret key                      |

   S3-compatible storage (R2, MinIO, etc.) is required since Deploy and the
   worker don't share a filesystem.

### From source

Prerequisites: [Deno](https://deno.land), [Go](https://go.dev),
[ffmpeg](https://ffmpeg.org), and a Whisper binary
([whisper.cpp](https://github.com/ggerganov/whisper.cpp)) if using local
transcription.

```bash
cp .env.example www/.env   # edit as needed

# Start everything (web app + worker)
./start.sh
```

The app is at `http://localhost:3000`. The worker is spawned automatically when
a recording starts.

To run the pieces separately:

```bash
# Terminal 1
cd www
deno task start

# Terminal 2
RECORDINGS_DIR=./data/recordings go run .
```

### Building from source

```bash
make          # builds dist/gubgub for your platform
make release  # cross-compiles for darwin-arm64, darwin-amd64, linux-amd64
make clean    # removes build artifacts
```

Requires Deno and Go.

## Configuration

### Config file (`~/.gubgub/config.toml`)

Used by the `gubgub` binary. Created on first run with all options commented
out.

```toml
[server]
port = 3000

[worker]
headless = true
chrome_path = ""
port_start = 8091

[transcription]
provider = "whisper"          # whisper | openai
whisper_bin = "whisper-cli"
whisper_model = "./models/ggml-base.bin"

[summarization]
provider = "ollama"           # ollama | openai | anthropic
ollama_url = "http://localhost:11434"
ollama_model = "gemma3:latest"

[google]
client_id = ""
client_secret = ""

[auth]
admin_email = ""
```

### Environment variables

When running from source, config lives in `www/.env`. All config file keys map
to env vars. Env vars take priority over the config file.

| Variable                 | Default                  | What it does                           |
| ------------------------ | ------------------------ | -------------------------------------- |
| `PORT`                   | `3000`                   | Web app port                           |
| `RECORDINGS_DIR`         | `./data/recordings`      | Where media files land                 |
| `WORKER_URL`             | `http://localhost:8089`  | Worker address (manual mode)           |
| `AUTO_START_WORKER`      | `false`                  | Let the web app spawn workers          |
| `WORKER_DIR`             | `..`                     | Path to worker source (for auto-start) |
| `TRANSCRIPTION_PROVIDER` | `whisper`                | `whisper` or `openai`                  |
| `SUMMARIZATION_PROVIDER` | `ollama`                 | `ollama`, `openai`, or `anthropic`     |
| `OLLAMA_URL`             | `http://localhost:11434` | Ollama API endpoint                    |
| `OLLAMA_MODEL`           | `gemma3:latest`          | Model for summarization                |
| `WHISPER_BIN`            | `whisper-cli`            | Whisper binary path                    |
| `WHISPER_MODEL`          | `./models/ggml-base.bin` | Whisper model file                     |
| `GOOGLE_CLIENT_ID`       | —                        | For Google Calendar integration        |
| `GOOGLE_CLIENT_SECRET`   | —                        | For Google Calendar integration        |
| `STORAGE_TYPE`           | `local`                  | `local` or `s3`                        |

### Provider matrix

Every AI call goes through a swappable provider. Mix and match depending on what
you have available.

|                   | Local       | Hosted             |
| ----------------- | ----------- | ------------------ |
| **Transcription** | whisper.cpp | OpenAI Whisper API |
| **Summarization** | Ollama      | OpenAI, Anthropic  |
| **Storage**       | Local disk  | S3, R2, MinIO      |
