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
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>gubgub — self-hosted meeting recorder for Google Meet</title>
        <meta
          name="description"
          content="Record, transcribe, and summarize your Google Meet meetings. Self-hosted, open source, and private. Uses Whisper for transcription and any LLM for summaries."
        />
        <link rel="canonical" href="https://meet.littledivy.com/" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="gubgub" />
        <meta
          property="og:title"
          content="gubgub — self-hosted meeting recorder for Google Meet"
        />
        <meta
          property="og:description"
          content="Record, transcribe, and summarize your Google Meet meetings. Self-hosted, open source, and private."
        />
        <meta
          property="og:image"
          content="https://meet.littledivy.com/screenshots/dashboard.png"
        />
        <meta property="og:url" content="https://meet.littledivy.com/" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="gubgub — self-hosted meeting recorder"
        />
        <meta
          name="twitter:description"
          content="Record, transcribe, and summarize your Google Meet meetings. Self-hosted, open source, and private."
        />
        <meta
          name="twitter:image"
          content="https://meet.littledivy.com/screenshots/dashboard.png"
        />

        <link rel="stylesheet" href="/styles.css" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/asciinema-player@3.9.0/dist/bundle/asciinema-player.css"
        />

        {/* Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "gubgub",
              description:
                "Self-hosted meeting recorder for Google Meet. Records, transcribes with Whisper, and summarizes with any LLM.",
              applicationCategory: "BusinessApplication",
              operatingSystem: "macOS, Linux",
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
              license: "https://opensource.org/licenses/MIT",
              url: "https://meet.littledivy.com/",
              sourceOrganization: {
                "@type": "Person",
                name: "Divy Srivastava",
                url: "https://github.com/littledivy",
              },
            }),
          }}
        />
      </head>
      <body>
        <div class="landing">
          <nav class="landing-nav" aria-label="Main navigation">
            <a class="brand" href="/">gubgub</a>
            <div class="landing-nav-links">
              <a href="https://github.com/littledivy/gubgub">GitHub</a>
              <a href="/login" class="btn btn-sm">Sign in to this instance</a>
            </div>
          </nav>

          <main>
          <section class="hero">
            <h1 class="hero-headline">
              Record, transcribe, and summarize<br />
              your meetings. Self-hosted.
            </h1>
            <p class="hero-sub">
              A bot joins your Google Meet, records everything, transcribes with
              Whisper, and summarizes with the LLM of your choice.
            </p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#install">Get Started</a>
              <a class="btn" href="https://github.com/littledivy/gubgub">
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
                    <span>/app</span>
                  </div>
                </div>
                <div class="browser-content">
                  <img
                    src="/screenshots/dashboard.png"
                    alt="gubgub dashboard showing meeting recordings, transcripts, and summaries"
                    loading="lazy"
                  />
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
              <pre class="install-code"><code>curl -fsSL https://meet.littledivy.com/install | sh</code></pre>
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

          </main>

          <footer class="landing-footer">
            <p>
              <a href="https://github.com/littledivy/gubgub">gubgub</a> is open
              source under the MIT license.
            </p>
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
