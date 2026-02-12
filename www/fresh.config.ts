import { defineConfig } from "$fresh/server.ts";

const port = parseInt(Deno.env.get("PORT") || "3000", 10);

export default defineConfig({
  server: { port, hostname: "0.0.0.0" },
});
