import { Handlers } from "$fresh/server.ts";
import { getContext, settingOrConfig } from "../../lib.ts";

export const handler: Handlers = {
  async GET() {
    const { db, config } = await getContext();
    const settings = await db.getSettings();

    return Response.json({
      status: "ok",
      transcription_provider: settingOrConfig(
        settings,
        "transcription_provider",
        config.transcriptionProvider,
      ),
      summarization_provider: settingOrConfig(
        settings,
        "summarization_provider",
        config.summarizationProvider,
      ),
      ollama_url: settingOrConfig(settings, "ollama_url", config.ollamaURL),
    });
  },
};
