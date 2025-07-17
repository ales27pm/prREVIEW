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
 * @property {string|null} error
 */

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_MAX_TOKENS = 1500;
const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_PROMPT = `You are an expert code reviewer. Think step by step about the diff you receive. Return a JSON object with two fields: "reasoning" - a short summary of your thought process - and "comments" - an array where each entry has "line" and "body" keys. Provide feedback only for substantive issues or improvements. The diff format is Unified and line numbers refer to the changed file.`;

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
        settings.systemPrompt ||
        (settings.reviewPersona &&
        Object.prototype.hasOwnProperty.call(
          PERSONA_PROMPTS,
          settings.reviewPersona,
        )
          ? PERSONA_PROMPTS[settings.reviewPersona]
          : null) ||
        DEFAULT_PROMPT,
      reviewPersona:
        settings.reviewPersona &&
        Object.prototype.hasOwnProperty.call(
          PERSONA_PROMPTS,
          settings.reviewPersona,
        )
          ? settings.reviewPersona
          : "",
      concurrencyLimit: settings.concurrencyLimit || 5,
      vectorIndexUrl: settings.vectorIndexUrl || "",
      error: null,
    };
  } catch (error) {
    console.error("Failed to load configuration:", error);
    return {
      error: "Could not load extension settings. Please try again.",
    };
  }
}
