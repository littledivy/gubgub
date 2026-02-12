import { Handlers } from "$fresh/server.ts";

const SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

REPO="divy/gubgub"
INSTALL_DIR="/usr/local/bin"
BINARY="gubgub"

# Detect OS
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)
    echo "error: unsupported OS: $(uname -s)"
    exit 1
    ;;
esac

# Detect architecture
case "$(uname -m)" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64)  ARCH="amd64" ;;
  *)
    echo "error: unsupported architecture: $(uname -m)"
    exit 1
    ;;
esac

ASSET="\${BINARY}-\${OS}-\${ARCH}"
echo "detected platform: \${OS}-\${ARCH}"

# Get latest release URL
if command -v gh &>/dev/null; then
  URL=$(gh release view --repo "$REPO" --json assets -q ".assets[] | select(.name == \\"\${ASSET}\\") | .url")
  if [ -z "$URL" ]; then
    echo "error: asset \${ASSET} not found in latest release"
    exit 1
  fi
else
  TAG=$(curl -fsSL "https://api.github.com/repos/\${REPO}/releases/latest" | grep '"tag_name"' | head -1 | cut -d'"' -f4)
  if [ -z "$TAG" ]; then
    echo "error: could not determine latest release"
    exit 1
  fi
  URL="https://github.com/\${REPO}/releases/download/\${TAG}/\${ASSET}"
  echo "latest release: \${TAG}"
fi

# Download
TMP=$(mktemp)
echo "downloading \${ASSET}..."
curl -fSL -o "$TMP" "$URL"
chmod +x "$TMP"

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "$TMP" "\${INSTALL_DIR}/\${BINARY}"
else
  echo "installing to \${INSTALL_DIR} (requires sudo)..."
  sudo mv "$TMP" "\${INSTALL_DIR}/\${BINARY}"
fi

echo "installed \${BINARY} to \${INSTALL_DIR}/\${BINARY}"
echo "run 'gubgub' to start"
`;

export const handler: Handlers = {
  GET() {
    return new Response(SCRIPT, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  },
};
