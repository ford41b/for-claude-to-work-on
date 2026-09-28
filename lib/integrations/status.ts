import { serverEnv } from "@/lib/config/env";
import type { IntegrationState } from "@/lib/ai/types";

/**
 * Optional-integration registry (§87). The UI adapts to these states; the core product never
 * depends on any of them. States reflect configuration, verified maturity, and availability.
 */
export interface IntegrationStatus {
  id: string;
  name: string;
  state: IntegrationState;
  purpose: string;
  note: string;
}

export function integrationStatuses(): IntegrationStatus[] {
  const env = serverEnv();
  return [
    {
      id: "ai",
      name: env.aiProvider === "gemini" ? "Google Gemini API" : env.aiProvider === "fixture" ? "Test AI provider" : "AI provider",
      state: env.aiProvider === "none" ? "DISABLED" : "AVAILABLE",
      purpose: "Sermon, photo, and document understanding; Sermon Packs; Ask AI; Bible studies.",
      note:
        env.aiProvider === "none"
          ? "Not configured. Notes, photos, library search, and Scripture detection still work."
          : env.aiProvider === "fixture"
            ? "Synthetic outputs for automated tests only."
            : `Models: ${env.GEMINI_MODEL_MEDIA} (media), ${env.GEMINI_MODEL_SYNTHESIS} (synthesis).`,
    },
    {
      id: "youtube_url_analysis",
      name: "YouTube URL analysis (Gemini)",
      state: env.aiProvider === "gemini" ? "PREVIEW" : env.aiProvider === "fixture" ? "AVAILABLE" : "DISABLED",
      purpose: "Analyze public YouTube sermons directly from their link.",
      note: "Preview feature: public videos only. Private or unlisted videos need an uploaded recording.",
    },
    {
      id: "youtube_data_api",
      name: "YouTube Data API",
      state: env.YOUTUBE_API_KEY ? "AVAILABLE" : "DISABLED",
      purpose: "Video title, duration, privacy and livestream status.",
      note: env.YOUTUBE_API_KEY ? "Configured." : "Not configured; basic title and channel come from oEmbed when reachable.",
    },
    {
      id: "bible_text",
      name: "Bible text provider",
      state: env.BIBLE_PROVIDER === "api_bible" && env.API_BIBLE_KEY ? "AVAILABLE" : "DISABLED",
      purpose: "Show verse text next to references.",
      note: "Without a licensed provider, references are shown without verse text.",
    },
    {
      id: "gemini_notebook_audio",
      name: "Gemini Notebook audio overviews",
      state: "UNAVAILABLE",
      purpose: "Optional audio overview provider (Phase 3).",
      note: "Enterprise-only Pre-GA API; not integrated. The app's own audio pipeline will be the default.",
    },
    {
      id: "meta_muse",
      name: "Meta Muse",
      state: "UNAVAILABLE",
      purpose: "Optional external notebook/media tool.",
      note: "No developer API for notebook import or media generation is available.",
    },
  ];
}
