const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Retrieves the OpenAI API key stored in Chrome's synchronized storage.
 *
 * Looks up the API key under the "openAIApiKey" key and returns it as a string, or `null` if not found.
 *
 * @returns {Promise<string|null>} The stored OpenAI API key, or `null` if not set.
 */
async function getStoredApiKey() {
  const result = await chrome.storage.sync.get("openAIApiKey");
  return result.openAIApiKey || null;
}

/**
 * Submits a unified diff patch to the OpenAI API for automated code review and returns structured feedback.
 *
 * Retrieves the OpenAI API key from the provided config or from Chrome's synchronized storage. Sends the patch to the OpenAI chat completions endpoint using the specified model and system prompt. Handles authentication and response errors, and parses the AI's JSON response to extract review comments.
 *
 * @param {string} patch - The unified diff patch to be reviewed.
 * @param {Object} [config] - Optional configuration including API key, model, and system prompt.
 * @returns {Promise<{comments: Array<{line: number, body: string}>}>} An object containing an array of review comments.
 * @throws {Error} If the API key is missing, authentication fails, the API response is invalid, or the AI returns malformed JSON.
 */
export async function getReviewForPatch(patch, config = {}) {
  const storedKey = await getStoredApiKey();
  const openAIApiKey = config.openAIApiKey || storedKey;
  const { openAIModel, systemPrompt } = config;

  if (!openAIApiKey) {
    throw new Error(
      "OpenAI API key not found. Please add it in the options page.",
    );
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIApiKey}`,
    },
    body: JSON.stringify({
      model: openAIModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Analyze the following diff and provide feedback:\n\n${patch}`,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (response.status === 401) {
    throw new Error("OpenAI API: Authentication failed. Check your API key.");
  }
  if (!response.ok) {
    throw new Error(`OpenAI API: ${response.status} ${response.statusText}`);
  }

  const aiResponse = await response.json();

  if (
    !aiResponse.choices ||
    aiResponse.choices.length === 0 ||
    !aiResponse.choices[0].message ||
    !aiResponse.choices[0].message.content
  ) {
    console.error("OpenAI API: Unexpected response structure.", aiResponse);
    throw new Error("OpenAI returned an invalid or empty response structure.");
  }

  try {
    const content = JSON.parse(aiResponse.choices[0].message.content);
    if (!content || !Array.isArray(content.comments)) {
      console.error(
        'AI response content is not in the expected format { "comments": [...] }:',
        content,
      );
      return { comments: [] };
    }
    return content;
  } catch (error) {
    console.error(
      "Failed to parse AI response content as JSON:",
      aiResponse.choices[0].message.content,
      error,
    );
    throw new Error("AI returned malformed JSON in its response.");
  }
}
