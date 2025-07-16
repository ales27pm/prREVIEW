const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

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

  if (!aiResponse.choices || aiResponse.choices.length === 0) {
    throw new Error("OpenAI API returned no choices in the response.");
  }

  const message = aiResponse.choices[0].message?.content;
  if (!message) {
    throw new Error("OpenAI API response did not include message content.");
  }

  try {
    const parsed = JSON.parse(message);
    if (!parsed || !Array.isArray(parsed.comments)) {
      console.error("AI response is not in expected format:", parsed);
      return { comments: [] };
    }
    return parsed;
  } catch (error) {
    console.error("Failed to parse AI response:", message, error);
    throw new Error("AI returned malformed JSON in its response.");
  }
}
