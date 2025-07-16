/**
 * @typedef {object} AppConfig
 * @property {string|null} githubToken
 * @property {string|null} openAIApiKey
 * @property {string} openAIModel
 * @property {string} systemPrompt
 * @property {number} concurrencyLimit
 * @property {string|null} error
 */

const DEFAULT_MODEL = "gpt-4o";
const DEFAULT_PROMPT = `You are an expert code reviewer. Your task is to analyze the provided code diff and return feedback in a JSON format. The JSON object should contain an array of "comments", where each comment has "line" (the line number relative to the diff) and "body" (your feedback). Provide feedback only if you find a substantive issue or a significant improvement. If there are no issues, return an empty "comments" array. The feedback should be concise and actionable. Diff format: Unified. The line number is the line number in the file that was changed.`;

/**
 * Loads the application configuration from Chrome's synchronized storage, returning stored values or defaults and validating required API keys.
 * @returns {Promise<AppConfig>} Resolves to the configuration object, or an error message if required API keys are missing or if loading fails.
 */
export async function loadConfig() {
  try {
    const settings = await chrome.storage.sync.get();

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
      systemPrompt: settings.systemPrompt || DEFAULT_PROMPT,
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
