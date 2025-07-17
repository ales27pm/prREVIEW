/**
 * @typedef {object} AppConfig
 * @property {string|null} githubToken
 * @property {string|null} openAIApiKey
 * @property {string} openAIModel
 * @property {number} maxTokens
 * @property {number} temperature
 * @property {string} systemPrompt
 * @property {string} [reviewPersona]
 * @property {number} concurrencyLimit
 * @property {string} [vectorIndexUrl]
 * @property {string} [feedbackUrl]
 * @property {string|null} error
 */

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_PROMPT = `You are an expert code reviewer. Analyze the diff carefully but keep your reasoning concise. Return actionable comments only for meaningful issues or improvements. Output JSON with "reasoning" (one short paragraph) and "comments" (array of {"line", "body"}). The diff format is Unified and line numbers refer to the changed file.`;

const PERSONA_PROMPTS = {
  strict:
    "You are a strict code reviewer who enforces repository guidelines such as using plain JavaScript, keeping code in the extension directory, and formatting with Prettier. Provide terse feedback only when necessary. Return JSON as described.",
  mentor:
    "You are a friendly mentor guiding contributors according to repository guidelines like using plain JavaScript and Prettier. Offer helpful suggestions in the JSON format described.",
};

const MODE_PROMPTS = {
  security:
    "You are a security auditor. Focus on vulnerabilities and insecure patterns. Return JSON with optional suggestedDiff fields for fixes.",
  performance:
    "You are a performance expert. Look for inefficiencies and propose improvements. Include suggestedDiff when possible.",
  tests:
    "You are a test generation assistant. Suggest missing tests and provide example diffs to add them.",
};

/**
 * Retrieves the application configuration from Chrome local storage, applying default values for optional settings and validating the presence of required API keys.
 * @returns {Promise<AppConfig>} Resolves to the configuration object, or an error message if required keys are missing or loading fails.
 */
import { loadSettings } from "./settings.js";

export async function loadConfig() {
  try {
    const settings = await loadSettings();

    const githubToken =
      settings.githubToken ||
      (typeof process !== "undefined" ? process.env.GITHUB_TOKEN : undefined);
    const openAIApiKey =
      settings.openAIApiKey ||
      (typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined);

    if (!githubToken || !openAIApiKey) {
      return {
        error:
          "API keys are missing. Provide them via environment variables or in the extension options.",
      };
    }

    const reviewMode = settings.reviewMode || "default";
    const personaPrompt =
      settings.reviewPersona &&
      Object.prototype.hasOwnProperty.call(
        PERSONA_PROMPTS,
        settings.reviewPersona,
      )
        ? PERSONA_PROMPTS[settings.reviewPersona]
        : null;
    const modePrompt =
      reviewMode &&
      Object.prototype.hasOwnProperty.call(MODE_PROMPTS, reviewMode)
        ? MODE_PROMPTS[reviewMode]
        : null;

    return {
      githubToken,
      openAIApiKey,
      openAIModel: settings.openAIModel || DEFAULT_MODEL,
      maxTokens: settings.maxTokens || DEFAULT_MAX_TOKENS,
      temperature:
        settings.temperature !== undefined
          ? settings.temperature
          : DEFAULT_TEMPERATURE,
      systemPrompt:
        settings.systemPrompt || modePrompt || personaPrompt || DEFAULT_PROMPT,
      reviewPersona: personaPrompt ? settings.reviewPersona : "",
      reviewMode,
      concurrencyLimit: settings.concurrencyLimit || 5,
      vectorIndexUrl: settings.vectorIndexUrl || "",
      feedbackUrl:
        settings.feedbackUrl ||
        (typeof process !== "undefined"
          ? process.env.FEEDBACK_ENDPOINT
          : undefined) ||
        "http://localhost:3000/feedback",
      error: null,
    };
  } catch (error) {
    console.error("Failed to load configuration:", error);
    return {
      error: "Could not load extension settings. Please try again.",
    };
  }
}
