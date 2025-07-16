const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

/**
 * Submits a unified diff patch to the OpenAI API for automated code review and returns structured feedback.
 *
 * Sends the provided patch to the OpenAI chat completions endpoint using the specified configuration, and returns an object containing an array of review comments. Handles authentication errors, invalid HTTP responses, and malformed or unexpected API responses. If the response does not contain valid comments, returns an empty array.
 *
 * @param {string} patch - The unified diff patch to be reviewed.
 * @param {object} config - Configuration object with OpenAI API credentials, model, and system prompt.
 * @returns {Promise<{comments: Array<{line: number, body: string}>}>} An object containing an array of code review comments, or an empty array if none are found.
 * @throws {Error} If authentication fails, the API response is invalid, or the returned JSON is malformed.
 */
export async function getReviewForPatch(patch, config) {
  const { openAIApiKey, openAIModel, systemPrompt } = config;

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
