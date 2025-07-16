// extension/content.js

// --- UI Management ---
let statusIndicator;

function injectStyle() {
  if (document.getElementById("ai-review-style")) return;
  const link = document.createElement("link");
  link.id = "ai-review-style";
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("status.css");
  document.head.appendChild(link);
}

function createStatusIndicator() {
  if (document.getElementById("ai-review-status-indicator")) return;

  injectStyle();

  statusIndicator = document.createElement("div");
  statusIndicator.id = "ai-review-status-indicator";
  statusIndicator.innerHTML = `
    <div class="spinner"></div>
    <p id="ai-review-status-text">Initializing...</p>
    <button id="ai-review-close-btn">×</button>
  `;
  document.body.appendChild(statusIndicator);

  document.getElementById("ai-review-close-btn").onclick = () => {
    statusIndicator.remove();
  };

  // Styles are injected from status.css
}

function updateStatus(message, isError = false, isComplete = false) {
  if (!statusIndicator) createStatusIndicator();
  document.getElementById("ai-review-status-text").textContent = message;
  const spinner = statusIndicator.querySelector(".spinner");
  if (isError || isComplete) {
    spinner.style.display = "none";
  } else {
    spinner.style.display = "block";
  }
}

async function fetchAllPRFiles(owner, repo, prNumber, token) {
  const files = [];
  const perPage = 100;
  let page = 1;
  const GITHUB_API_URL = "https://api.github.com";
  while (true) {
    const res = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `token ${token}` } }
    );
    if (!res.ok) break;
    const data = await res.json();
    files.push(...data);
    if (data.length < perPage) break;
    page += 1;
  }
  return files;
}

// --- Main Logic ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "run_review") {
    runReviewFlow(request.prDetails);
    sendResponse({ status: "Review started" });
  }
  return true;
});

async function runReviewFlow(prDetails) {
  updateStatus("Starting AI review...");

  try {
    const { githubToken, openAIApiKey } = await chrome.storage.local.get([
      "githubToken",
      "openAIApiKey",
    ]);
    if (!githubToken || !openAIApiKey) {
      updateStatus(
        "API keys not set. Please configure them in the extension options.",
        true
      );
      return;
    }

    updateStatus("Fetching PR data...");
    const { owner, repo, prNumber } = prDetails;
    const GITHUB_API_URL = "https://api.github.com";

    const files = await fetchAllPRFiles(owner, repo, prNumber, githubToken);
    const prData = await (
      await fetch(
        `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}`,
        {
          headers: { Authorization: `token ${githubToken}` },
        }
      )
    ).json();
    const commitId = prData.head.sha;

    const filesToReview = files.filter((file) => file.patch); // Only review files with a patch

    for (let i = 0; i < filesToReview.length; i++) {
      const file = filesToReview[i];
      updateStatus(
        `Analyzing file ${i + 1}/${filesToReview.length}: ${file.filename}`
      );

      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAIApiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4-turbo",
            messages: [
              {
                role: "system",
                content: `You are an expert code reviewer. Your task is to analyze the provided code diff and return feedback in a JSON format. The JSON object should contain an array of "comments", where each comment has "line" (the line number relative to the diff) and "body" (your feedback). Provide feedback only if you find a substantive issue or a significant improvement. If there are no issues, return an empty "comments" array. The feedback should be concise and actionable. Diff format: Unified. The line number is the line number in the file that was changed. Diff content:\n\n${file.patch}`,
              },
              {
                role: "user",
                content: file.patch,
              },
            ],
            response_format: { type: "json_object" },
          }),
        }
      );

      if (!response.ok) continue; // Silently skip files the AI fails on

      const aiResponse = await response.json();
      const feedback = JSON.parse(aiResponse.choices[0].message.content);

      if (feedback.comments && feedback.comments.length > 0) {
        for (const comment of feedback.comments) {
          await fetch(
            `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
            {
              method: "POST",
              headers: {
                Authorization: `token ${githubToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                body: comment.body,
                commit_id: commitId,
                path: file.filename,
                line: comment.line,
                side: "RIGHT",
              }),
            }
          );
        }
      }
    }

    updateStatus("Review complete! Reloading...", false, true);
    setTimeout(() => window.location.reload(), 2000);
  } catch (error) {
    console.error("PR Review Flow Error:", error);
    updateStatus(`Error: ${error.message}`, true);
  }
}
