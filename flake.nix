{
  description = "Gubgub";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        isDarwin = pkgs.stdenv.isDarwin;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
            gopls
            gotools
            go-tools
            sqlite
            deno
            ffmpeg
          ] ++ pkgs.lib.optionals isDarwin [
            pkgs.darwin.apple_sdk.frameworks.CoreFoundation
            pkgs.darwin.apple_sdk.frameworks.Security
          ] ++ pkgs.lib.optionals (!isDarwin) [
            pkgs.chromium
          ];

          env = {
            CGO_ENABLED = "1";
          } // pkgs.lib.optionalAttrs (!isDarwin) {
            CHROME_PATH = "${pkgs.chromium}/bin/chromium";
          };

          shellHook = ''
            echo "gubgub dev shell ready"
          '';
        };
      }
    );
}
