.PHONY: all clean worker fresh compile release

DIST    := dist
WWW     := www
BIN_DIR := $(WWW)/bin

all: $(DIST)/gubgub

$(BIN_DIR)/worker: main.go quirks.go go.mod
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BIN_DIR)/worker .

worker: $(BIN_DIR)/worker

$(WWW)/_fresh: $(WWW)/dev.ts $(WWW)/fresh.config.ts $(WWW)/deno.json
	cd $(WWW) && deno task build
	@touch $(WWW)/_fresh

fresh: $(WWW)/_fresh

$(DIST)/gubgub: $(BIN_DIR)/worker $(WWW)/_fresh $(WWW)/cli.ts $(WWW)/lib.ts
	@mkdir -p $(DIST)
	cd $(WWW) && deno compile -A --no-check --unstable-kv \
		--include bin \
		--include _fresh \
		--include static \
		--output ../$(DIST)/gubgub \
		cli.ts

compile: $(DIST)/gubgub

release: $(BIN_DIR)/worker $(WWW)/_fresh
	@mkdir -p $(DIST)
	# darwin-arm64
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BIN_DIR)/worker .
	cd $(WWW) && deno compile -A --no-check --unstable-kv \
		--include bin --include _fresh --include static \
		--target aarch64-apple-darwin \
		--output ../$(DIST)/gubgub-darwin-arm64 \
		cli.ts
	# darwin-amd64
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BIN_DIR)/worker .
	cd $(WWW) && deno compile -A --no-check --unstable-kv \
		--include bin --include _fresh --include static \
		--target x86_64-apple-darwin \
		--output ../$(DIST)/gubgub-darwin-amd64 \
		cli.ts
	# linux-amd64
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -ldflags="-s -w" -o $(BIN_DIR)/worker .
	cd $(WWW) && deno compile -A --no-check --unstable-kv \
		--include bin --include _fresh --include static \
		--target x86_64-unknown-linux-gnu \
		--output ../$(DIST)/gubgub-linux-amd64 \
		cli.ts

clean:
	rm -rf $(DIST) $(BIN_DIR) $(WWW)/_fresh
