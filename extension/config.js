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
 * @property {string|null} error
 */

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_PROMPT = `You are an expert code reviewer. Your task is to analyze the provided code diff and return feedback in a JSON format. The JSON object should contain an array of "comments", where each comment has "line" (the line number relative to the diff) and "body" (your feedback). Provide feedback only if you find a substantive issue or a significant improvement. If there are no issues, return an empty "comments" array. The feedback should be concise and actionable. Diff format: Unified. The line number is the line number in the file that was changed.`;

const PERSONA_PROMPTS = {
  strict:
    "You are a strict code reviewer who enforces repository guidelines such as using plain JavaScript, keeping code in the extension directory, and formatting with Prettier. Provide terse feedback only when necessary. Return JSON as described.",
  mentor:
    "You are a friendly mentor guiding contributors according to repository guidelines like using plain JavaScript and Prettier. Offer helpful suggestions in the JSON format described.",
};

/**
 * Retrieves the application configuration from Chrome local storage, applying default values for optional settings and validating the presence of required API keys.
 * @returns {Promise<AppConfig>} Resolves to the configuration object, or an error message if required keys are missing or loading fails.
 */
import { loadSettings } from "./settings.js";

/**
 * Loads the application configuration from Chrome local storage, including API keys, model settings, prompt, concurrency limit, and reviewer persona.
 *
 * Returns an object containing the configuration values if successful, or an error message if required API keys are missing or settings cannot be loaded.
 * The system prompt is selected based on the specified reviewer persona if it matches a predefined persona; otherwise, it falls back to a custom or default prompt.
 * @returns {Promise<AppConfig|{error: string}>} The loaded configuration object or an error message.
 */
export async function loadConfig() {
  try {
    const settings = await loadSettings();

    if (!settings.githubToken || !settings.openAIApiKey) {
      return {
        error:
          "API keys are missing. Please configure them in the extension options.",
      };
    }

    return {
      githubToken: settings.githubToken,
      openAIApiKey: settings.openAIApiKey,
      openAIModel: settings.openAIModel || DEFAULT_MODEL,
      maxTokens: settings.maxTokens || DEFAULT_MAX_TOKENS,
      temperature:
        settings.temperature !== undefined
          ? settings.temperature
          : DEFAULT_TEMPERATURE,
      systemPrompt:
        PERSONA_PROMPTS[settings.reviewPersona] ||
        settings.systemPrompt ||
        DEFAULT_PROMPT,
      reviewPersona: settings.reviewPersona || "",
      concurrencyLimit: settings.concurrencyLimit || 5,
      error: null,
    };
  } catch (error) {
    console.error("Failed to load configuration:", error);
    return {
      error: "Could not load extension settings. Please try again.",
    };
  }
}
