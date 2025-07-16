// extension/content.js

// --- UI Management ---
let statusIndicator;

function createStatusIndicator() {
  if (document.getElementById("ai-review-status-indicator")) return;

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

  // Add styles
  const style = document.createElement("style");
  style.textContent = `
    #ai-review-status-indicator {
      position: fixed; top: 20px; right: 20px; background-color: #2c3e50; color: white;
      padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      z-index: 9999; display: flex; align-items: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    #ai-review-status-indicator .spinner {
      border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%;
      width: 20px; height: 20px; animation: spin 1s linear infinite; margin-right: 15px;
    }
    #ai-review-status-text { margin: 0; font-size: 14px; }
    #ai-review-close-btn { background: none; border: none; color: white; font-size: 24px;
      cursor: pointer; margin-left: 20px; opacity: 0.7; }
    #ai-review-close-btn:hover { opacity: 1; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
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

    const files = await (
      await fetch(
        `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/files`,
        {
          headers: { Authorization: `token ${githubToken}` },
        }
      )
    ).json();
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
                Authorization: `Bearer ${githubToken}`,
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
