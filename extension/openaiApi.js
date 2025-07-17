const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MAX_METADATA_LENGTH = 200;
const DEFAULT_MODEL = "gpt-4o";

function truncateText(text, maxLength = MAX_METADATA_LENGTH) {
  const trimmed = (text || "").trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength - 1)}…`
    : trimmed;
}

const CLAUDE_MODELS = [
  "claude-1",
  "claude-1.2",
  "claude-2",
  "claude-2.0",
  "claude-2.1",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
];

function formatUserContent(content, model) {
  const normalized = (model || "").toLowerCase();
  const isClaude = CLAUDE_MODELS.some((m) => m.toLowerCase() === normalized);
  return isClaude ? `<analysis>\n${content}\n</analysis>` : content;
}

/**
 * Submits a unified diff patch to the OpenAI API for automated code review and returns structured feedback.
 *
 * Sends the provided patch to the OpenAI chat completions endpoint using the specified configuration, and returns an object containing an array of review comments. Handles authentication errors, invalid HTTP responses, and malformed or unexpected API responses. If the response does not contain valid comments, returns an empty array.
 *
 * @param {string} patch - The unified diff patch to be reviewed.
 * @param {object} config - Configuration including OpenAI credentials and prompt options. Supports `prTitle` and `prBody` for pull request context.
 * @returns {Promise<{reasoning: string, comments: Array<{line: number, body: string}>}>} An object with overall reasoning and an array of code review comments.
 * @throws {Error} If authentication fails, the API response is invalid, or the returned JSON is malformed.
 */
import { loadSettings } from "./settings.js";
import { loadIndex, getRelevantSnippets, getGraphContext } from "./rag.js";

export async function getReviewForPatch(patch, config = {}) {
  const settings = await loadSettings();
  const openAIApiKey =
    config.openAIApiKey ||
    settings.openAIApiKey ||
    (typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined);
  const {
    openAIModel,
    systemPrompt,
    maxTokens,
    temperature,
    prTitle = "",
    prBody = "",
  } = config;

  const title = truncateText(prTitle);
  const body = truncateText(prBody);
  let prContext = "";
  if (title) prContext += `Pull request title: ${title}\n`;
  if (body) prContext += `Pull request description: ${body}\n`;
  if (prContext) prContext += "\n";

  let extraContext = "";
  if (config.vectorIndexUrl) {
    try {
      const index = await loadIndex(config.vectorIndexUrl);
      const vecSnippets =
        index && Array.isArray(index.embeddings)
          ? await getRelevantSnippets(patch, index.embeddings, openAIApiKey)
          : [];
      const graphSnippets = index ? getGraphContext(patch, index) : [];
      const snippets = Array.from(new Set([...vecSnippets, ...graphSnippets]));
      if (snippets.length > 0) {
        extraContext = `Relevant context:\n${snippets.join("\n\n")}\n\n`;
      }
    } catch (err) {
      console.error("Failed to retrieve context for RAG:", err);
    }
  }

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
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: formatUserContent(
            `${prContext}${extraContext}Analyze the following diff step by step. Provide a short summary of your reasoning and inline comments. Return a JSON object with \"reasoning\" and \"comments\" as described.\n\n${patch}`,
            openAIModel,
          ),
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

async function synthesizeFeedback(reviews, config = {}) {
  const settings = await loadSettings();
  const openAIApiKey =
    config.openAIApiKey ||
    settings.openAIApiKey ||
    (typeof process !== "undefined" ? process.env.OPENAI_API_KEY : undefined);
  const model = config.synthModel || config.openAIModel || DEFAULT_MODEL;
  const { maxTokens = 512, temperature = 0.7 } = config;

  const summaryPrompt =
    "You are a reflection agent. Combine the following reviews, remove duplicates, " +
    "detect and flag contradictions, and order comments by importance. Return the cleaned " +
    "JSON result as described.";

  const userContent = reviews
    .map((r, i) => `Review ${i + 1}: ${JSON.stringify(r)}`)
    .join("\n");

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAIApiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: summaryPrompt },
        { role: "user", content: userContent },
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
    const content = JSON.parse(aiResponse.choices[0].message.content);
    return content && Array.isArray(content.comments)
      ? content
      : { comments: [] };
  } catch (err) {
    throw new Error("AI returned malformed JSON in its response.");
  }
}

export async function getMultiAgentReviewForPatch(patch, config = {}) {
  const agentCount =
    Number.isInteger(config.agentCount) && config.agentCount > 0
      ? config.agentCount
      : 3;
  const reviews = await Promise.all(
    Array.from({ length: agentCount }, () => getReviewForPatch(patch, config)),
  );
  return synthesizeFeedback(reviews, config);
}
