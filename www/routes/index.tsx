import { Handlers } from "$fresh/server.ts";
import { getContext } from "../lib.ts";

export const handler: Handlers = {
  async GET(_req, ctx) {
    const { config } = await getContext();
    if (!config.notSelfHosted && Deno.env.get("DEV_LANDING") !== "1") {
      return Response.redirect(new URL("/app", _req.url), 307);
    }
    return ctx.render();
  },
};

export default function Landing() {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>gubgub — self-hosted meeting recorder</title>
        <link rel="stylesheet" href="/styles.css" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/asciinema-player@3.9.0/dist/bundle/asciinema-player.css"
        />
      </head>
      <body>
        <div class="landing">
          <nav class="landing-nav">
            <a class="brand" href="/">gubgub</a>
            <div class="landing-nav-links">
              <a href="https://github.com/anthropics/grain">GitHub</a>
              <a href="/login" class="btn btn-primary btn-sm">Sign In</a>
            </div>
          </nav>

          <section class="hero">
            <h1 class="hero-headline">
              Record, transcribe, and summarize<br />
              your meetings. Self-hosted.
            </h1>
            <p class="hero-sub">
              A bot joins your Google Meet, records everything, transcribes with
              Whisper, and summarizes with the LLM of your choice. Your data
              stays on your machine.
            </p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#install">Get Started</a>
              <a class="btn" href="https://github.com/anthropics/grain">
                View Source
              </a>
            </div>
          </section>

          {/* asciinema demo */}
          <section class="demo-section">
            <div class="demo-window">
              <div class="demo-titlebar">
                <span class="demo-dot" style="background:#ff5f57" />
                <span class="demo-dot" style="background:#febc2e" />
                <span class="demo-dot" style="background:#28c840" />
                <span class="demo-title">terminal</span>
              </div>
              <div class="demo-body" id="demo-player" />
            </div>
          </section>

          {/* product showcase */}
          <section class="showcase-section">
            <h2 class="section-heading">Everything in one place</h2>
            <p class="section-sub">
              Dashboard, recordings, transcripts, summaries, calendar — all
              accessible from a clean web UI.
            </p>

            {/* main hero screenshot */}
            <div class="showcase-hero">
              <div class="browser-frame">
                <div class="browser-bar">
                  <div class="browser-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div class="browser-url">
                    <span>localhost:3000/app</span>
                  </div>
                </div>
                <div class="browser-content">
                  <img
                    src="/screenshots/dashboard.png"
                    alt="Dashboard overview"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>

            {/* feature screenshots row */}
            <div class="showcase-features">
              <div class="showcase-card">
                <div class="browser-frame browser-sm">
                  <div class="browser-bar">
                    <div class="browser-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div class="browser-url">
                      <span>localhost:3000/meetings/...</span>
                    </div>
                  </div>
                  <div class="browser-content">
                    <img
                      src="/screenshots/meeting.png"
                      alt="Meeting recording and transcript"
                      loading="lazy"
                    />
                  </div>
                </div>
                <h3>Recordings &amp; Transcripts</h3>
                <p>
                  Watch the recording with full seeking, read the transcript
                  with timestamps, and review the AI summary.
                </p>
              </div>
              <div class="showcase-card">
                <div class="browser-frame browser-sm">
                  <div class="browser-bar">
                    <div class="browser-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div class="browser-url">
                      <span>localhost:3000/calendar</span>
                    </div>
                  </div>
                  <div class="browser-content">
                    <img
                      src="/screenshots/calendar.png"
                      alt="Calendar view"
                      loading="lazy"
                    />
                  </div>
                </div>
                <h3>Calendar Integration</h3>
                <p>
                  Connect Google Calendar. See upcoming meetings and start
                  recording with one click.
                </p>
              </div>
              <div class="showcase-card">
                <div class="browser-frame browser-sm">
                  <div class="browser-bar">
                    <div class="browser-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div class="browser-url">
                      <span>localhost:3000/workers</span>
                    </div>
                  </div>
                  <div class="browser-content">
                    <img
                      src="/screenshots/workers.png"
                      alt="Worker management"
                      loading="lazy"
                    />
                  </div>
                </div>
                <h3>Worker Management</h3>
                <p>
                  Start, stop, and monitor recording workers. Live-stream logs
                  in real time.
                </p>
              </div>
            </div>
          </section>

          {/* how it works */}
          <section class="steps-section">
            <h2 class="section-heading">How it works</h2>
            <div class="steps">
              <div class="step">
                <div class="step-num">1</div>
                <div>
                  <h3>Install</h3>
                  <p>One command. No Docker, no Kubernetes.</p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">2</div>
                <div>
                  <h3>Record</h3>
                  <p>
                    Paste a Google Meet link or pick from your calendar. A
                    Chrome worker joins and records.
                  </p>
                </div>
              </div>
              <div class="step">
                <div class="step-num">3</div>
                <div>
                  <h3>Transcribe &amp; Summarize</h3>
                  <p>
                    Audio goes through Whisper, then your chosen LLM produces
                    action items and a summary.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* install / CLI */}
          <section class="install-section" id="install">
            <h2 class="section-heading">Get started in seconds</h2>
            <div class="install-block">
              <div class="install-tabs">
                <span class="install-tab active">macOS</span>
                <span class="install-tab">Linux</span>
              </div>
              <pre class="install-code"><code>curl -fsSL https://gubgub.sh/install | sh</code></pre>
              <p class="install-note">
                Then run <code>gubgub</code> to start the server. That's it.
              </p>
            </div>
          </section>

          {/* infra / features */}
          <section class="infra-section">
            <h2>Runs where you want it</h2>
            <div class="infra-grid">
              <div class="infra-card">
                <h3>No cloud required</h3>
                <p>
                  Everything runs on your machine. Recordings stay on local disk
                  or your own S3.
                </p>
              </div>
              <div class="infra-card">
                <h3>Bring your models</h3>
                <p>
                  Whisper + Ollama for fully local. Or point at OpenAI,
                  Anthropic, or any compatible API.
                </p>
              </div>
              <div class="infra-card">
                <h3>Team access control</h3>
                <p>
                  Google OAuth with domain/email allowlists. One admin env var
                  to set up.
                </p>
              </div>
              <div class="infra-card">
                <h3>Calendar integration</h3>
                <p>
                  Connect Google Calendar to see upcoming meetings and record
                  with one click.
                </p>
              </div>
            </div>
          </section>

          <footer class="landing-footer">
            <p>gubgub is open source under the MIT license.</p>
          </footer>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/asciinema-player@3.9.0/dist/bundle/asciinema-player.min.js">
        </script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
          document.addEventListener('DOMContentLoaded', function() {
            var el = document.getElementById('demo-player');
            if (el && window.AsciinemaPlayer) {
              AsciinemaPlayer.create('/demo.cast', el, {
                cols: 72,
                rows: 24,
                autoPlay: true,
                loop: true,
                speed: 1,
                theme: 'monokai',
                fit: 'width',
                terminalFontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                terminalFontSize: '13px',
              });
            }
          });
        `,
          }}
        />
      </body>
    </html>
  );
}
