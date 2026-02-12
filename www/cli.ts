#!/usr/bin/env -S deno run -A --unstable-kv

// deno-lint-ignore-file no-explicit-any
import manifest from "./fresh.gen.ts";
import { join } from "$std/path/join.ts";
import { dirname } from "$std/path/dirname.ts";
import { resolve } from "$std/path/resolve.ts";
import { fromFileUrl } from "$std/path/from_file_url.ts";
import { parse as parseToml } from "https://deno.land/std@0.216.0/toml/parse.ts";
import { getServerContext } from "https://deno.land/x/fresh@1.6.8/src/server/context.ts";
import { DEFAULT_RENDER_FN } from "https://deno.land/x/fresh@1.6.8/src/server/render.ts";

const VERSION = "0.1.0";

const DEFAULT_CONFIG = `# gubgub configuration
# Uncomment and edit values as needed.

[server]
# port = 3000

[worker]
# headless = true
# chrome_path = ""
# port_start = 8091

[transcription]
# provider = "whisper"          # whisper | openai
# whisper_bin = "whisper-cli"
# whisper_model = "./models/ggml-base.bin"
# openai_url = "https://api.openai.com"
# openai_api_key = ""
# openai_model = "whisper-1"

[summarization]
# provider = "ollama"           # ollama | openai | anthropic
# ollama_url = "http://localhost:11434"
# ollama_model = "gemma3:latest"
# openai_api_key = ""
# openai_api_url = "https://api.openai.com"
# openai_model = "gpt-4o"
# anthropic_api_key = ""
# anthropic_model = "claude-sonnet-4-20250514"

[google]
# client_id = ""
# client_secret = ""
# redirect_url = "http://localhost:3000/api/auth/google/callback"

[auth]
# admin_email = ""
`;

const CONFIG_MAP: Record<string, Record<string, string>> = {
  server: {
    port: "PORT",
  },
  worker: {
    headless: "WORKER_HEADLESS",
    chrome_path: "WORKER_CHROME_PATH",
    port_start: "WORKER_PORT_START",
  },
  transcription: {
    provider: "TRANSCRIPTION_PROVIDER",
    whisper_bin: "WHISPER_BIN",
    whisper_model: "WHISPER_MODEL",
    openai_url: "OPENAI_TRANSCRIPTION_URL",
    openai_api_key: "OPENAI_TRANSCRIPTION_API_KEY",
    openai_model: "OPENAI_TRANSCRIPTION_MODEL",
  },
  summarization: {
    provider: "SUMMARIZATION_PROVIDER",
    ollama_url: "OLLAMA_URL",
    ollama_model: "OLLAMA_MODEL",
    openai_api_key: "OPENAI_API_KEY",
    openai_api_url: "OPENAI_API_URL",
    openai_model: "OPENAI_MODEL",
    anthropic_api_key: "ANTHROPIC_API_KEY",
    anthropic_model: "ANTHROPIC_MODEL",
  },
  google: {
    client_id: "GOOGLE_CLIENT_ID",
    client_secret: "GOOGLE_CLIENT_SECRET",
    redirect_url: "GOOGLE_REDIRECT_URL",
  },
  auth: {
    admin_email: "ADMIN_EMAIL",
  },
};

function printHelp() {
  console.log(`gubgub v${VERSION} — meeting recorder

Usage: gubgub [options]

Options:
  --port <port>       Port to listen on (default: 3000)
  --data-dir <path>   Data directory (default: ~/.gubgub)
  --help              Show this help message
  --version           Show version

Config: ~/.gubgub/config.toml`);
}

function parseArgs(args: string[]): { port: number | null; dataDir: string } {
  let port: number | null = null;
  let dataDir = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--help":
      case "-h":
        printHelp();
        Deno.exit(0);
        break;
      case "--version":
      case "-v":
        console.log(`gubgub v${VERSION}`);
        Deno.exit(0);
        break;
      case "--port":
      case "-p":
        port = parseInt(args[++i], 10);
        if (isNaN(port)) {
          console.error("error: --port requires a number");
          Deno.exit(1);
        }
        break;
      case "--data-dir":
        dataDir = args[++i];
        if (!dataDir) {
          console.error("error: --data-dir requires a path");
          Deno.exit(1);
        }
        break;
      default:
        console.error(`unknown option: ${args[i]}`);
        printHelp();
        Deno.exit(1);
    }
  }

  if (!dataDir) {
    dataDir = Deno.env.get("GUBGUB_DATA_DIR") ||
      join(Deno.env.get("HOME") || "~", ".gubgub");
  }

  return { port, dataDir };
}

async function loadConfig(dataDir: string): Promise<void> {
  const configPath = join(dataDir, "config.toml");

  try {
    await Deno.stat(configPath);
  } catch {
    await Deno.mkdir(dataDir, { recursive: true });
    await Deno.writeTextFile(configPath, DEFAULT_CONFIG);
    console.log(`created config: ${configPath}`);
    return;
  }

  const text = await Deno.readTextFile(configPath);
  const toml = parseToml(text) as Record<string, Record<string, unknown>>;

  for (const [section, keys] of Object.entries(CONFIG_MAP)) {
    const block = toml[section];
    if (!block) continue;
    for (const [key, envVar] of Object.entries(keys)) {
      const val = block[key];
      if (val === undefined || val === null) continue;
      if (!Deno.env.get(envVar)) {
        Deno.env.set(envVar, String(val));
      }
    }
  }
}

async function extractWorker(dataDir: string): Promise<string> {
  const binDir = join(dataDir, "bin");
  const destBinary = join(binDir, "worker");
  const versionFile = join(binDir, ".version");

  const srcDir = import.meta.dirname;
  if (!srcDir) {
    console.error("error: cannot determine binary directory");
    Deno.exit(1);
  }
  const srcBinary = join(srcDir, "bin", "worker");

  let needsExtract = false;
  try {
    await Deno.stat(destBinary);
    try {
      const existing = await Deno.readTextFile(versionFile);
      if (existing.trim() !== VERSION) {
        needsExtract = true;
      }
    } catch {
      needsExtract = true;
    }
  } catch {
    needsExtract = true;
  }

  if (needsExtract) {
    console.log(`extracting worker binary to ${destBinary}...`);
    await Deno.mkdir(binDir, { recursive: true });
    await Deno.copyFile(srcBinary, destBinary);
    await Deno.chmod(destBinary, 0o755);
    await Deno.writeTextFile(versionFile, VERSION);
  }

  return destBinary;
}

async function ensureDirs(
  dataDir: string,
): Promise<{ recordingsDir: string; profilesDir: string }> {
  const recordingsDir = join(dataDir, "data", "recordings");
  const profilesDir = join(dataDir, "data", "chrome-profiles");

  await Deno.mkdir(recordingsDir, { recursive: true });
  await Deno.mkdir(profilesDir, { recursive: true });

  return { recordingsDir, profilesDir };
}

const { port: cliPort, dataDir } = parseArgs(Deno.args);
const absDataDir = resolve(dataDir);

await loadConfig(absDataDir);

console.log(`gubgub v${VERSION}`);
console.log(`data dir: ${absDataDir}`);

const workerBinary = await extractWorker(absDataDir);

const { recordingsDir, profilesDir } = await ensureDirs(absDataDir);

const port = cliPort ?? parseInt(Deno.env.get("PORT") || "3000", 10);
Deno.env.set("PORT", String(port));
Deno.env.set("WORKER_BINARY", workerBinary);
Deno.env.set("RECORDINGS_DIR", recordingsDir);
Deno.env.set("PROFILES_DIR", profilesDir);
Deno.env.set("AUTO_START_WORKER", "true");
if (!Deno.env.get("WORKER_HEADLESS")) {
  Deno.env.set("WORKER_HEADLESS", "true");
}

// Fresh's start() requires deno.json on disk which doesn't exist in compiled
// binaries. We bypass it and construct the server context directly.
const base = dirname(fromFileUrl(manifest.baseUrl));

const state: any = {
  config: {
    dev: false,
    build: {
      outDir: join(base, "_fresh"),
      target: ["chrome99", "firefox99", "safari15"],
    },
    plugins: [],
    staticDir: join(base, "static"),
    render: DEFAULT_RENDER_FN,
    router: undefined,
    server: { port, hostname: "0.0.0.0" },
    basePath: "",
  },
  manifest,
  loadSnapshot: true,
  didLoadSnapshot: false,
  denoJsonPath: "",
  denoJson: {
    imports: {},
    compilerOptions: { jsx: "react-jsx", jsxImportSource: "preact" },
  },
  build: false,
};

console.log(`starting server on http://localhost:${port}`);

const ctx = await getServerContext(state);
await Deno.serve(
  { port, hostname: "0.0.0.0" },
  ctx.handler() as Deno.ServeHandler,
).finished;
