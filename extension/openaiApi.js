const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Sends a code diff patch to the OpenAI API and returns structured code review comments.
 *
 * The function analyzes the provided patch using the OpenAI "gpt-4o" model, requesting feedback as a JSON object containing an array of comments. Each comment includes a line number and feedback body. If no issues are found or the response cannot be parsed, an empty comments array is returned.
 *
 * @param {string} patch - The unified diff patch to be reviewed.
 * @param {string} apiKey - The OpenAI API key for authentication.
 * @returns {Promise<Object>} A promise that resolves to a JSON object with a `comments` array containing code review feedback.
 * @throws {Error} If authentication fails or the API response is not successful.
 */
export async function getReviewForPatch(patch, apiKey) {
  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert code reviewer. Your task is to analyze the provided code diff and return feedback in a JSON format. The JSON object should contain an array of "comments", where each comment has "line" (the line number relative to the diff) and "body" (your feedback). Provide feedback only if you find a substantive issue or a significant improvement. If there are no issues, return an empty "comments" array. The feedback should be concise and actionable. Diff format: Unified. The line number is the line number in the file that was changed. Diff content:\n\n${patch}`,
        },
        {
          role: "user",
          content: patch,
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
  try {
    return JSON.parse(aiResponse.choices[0].message.content);
  } catch (error) {
    console.error("Failed to parse AI response:", error);
    return { comments: [] };
  }
}
