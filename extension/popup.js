// extension/popup.js

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  const reviewButton = document.getElementById("run-review");
  if (reviewButton) {
    reviewButton.addEventListener("click", async () => {
      reviewButton.disabled = true;
      reviewButton.textContent = "Running...";
      try {
        await runReview();
      } finally {
        reviewButton.disabled = false;
        reviewButton.textContent = "Run Review";
      }
    });
  }

  const settingsButton = document.getElementById("open-settings");
  if (settingsButton) {
    settingsButton.addEventListener("click", () => {
      chrome.runtime.openOptionsPage();
    });
  }
}

async function runReview() {
  const tab = await getActiveTab();
  const prDetails = extractPRDetails(tab.url);
  if (!prDetails) {
    alert("Not a valid GitHub PR page!");
    return;
  }

  const githubToken = await getGithubToken();
  if (!githubToken) {
    alert("GitHub token not found. Please set it in the extension settings.");
    chrome.runtime.openOptionsPage();
    return;
  }

  try {
    const diffs = await fetchPRDiffs(prDetails, githubToken);
    if (diffs.length === 0) return;

    const commitId = await getPRCommitId(prDetails, githubToken);

    for (const file of diffs) {
      const suggestions = await analyzeDiffWithOpenAI(file.patch);
      if (!suggestions) continue;

      const changes = extractChangesFromDiff([file]);
      if (changes.length > 0) {
        const firstChange = changes[0];
        await postPRComment(
          githubToken,
          prDetails,
          suggestions,
          firstChange.line,
          firstChange.file,
          commitId
        );
      }
    }
    chrome.tabs.reload();
  } catch (error) {
    console.error("An error occurred during the review process:", error);
    alert("An error occurred. Check the browser console for more details.");
  }
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function getGithubToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["githubToken"], (result) => {
      resolve(result.githubToken);
    });
  });
}

function extractPRDetails(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: match[3] };
}

async function fetchPRDiffs({ owner, repo, prNumber }, githubToken) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!response.ok) {
    console.error("Failed to fetch PR diffs:", response.status);
    alert(`Failed to fetch PR diffs. Status: ${response.status}`);
    return [];
  }
  const files = await response.json();
  return files.map((file) => ({
    filename: file.filename,
    patch: file.patch,
  }));
}

async function getPRCommitId(prDetails, githubToken) {
  const url = `https://api.github.com/repos/${prDetails.owner}/${prDetails.repo}/pulls/${prDetails.prNumber}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  const prData = await response.json();
  return prData.head.sha;
}

async function analyzeDiffWithOpenAI(patch) {
  console.log("Analyzing patch with AI...");
  if (patch) {
    return "This is a placeholder AI suggestion. Consider improving variable names and adding comments for clarity.";
  }
  return null;
}

function extractChangesFromDiff(diffData) {
  const changes = [];
  diffData.forEach((file) => {
    if (!file.patch) return;
    const lines = file.patch.split("\n");
    let currentLine = 0;
    lines.forEach((line) => {
      if (line.startsWith("@@")) {
        const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) currentLine = parseInt(match[1], 10);
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        changes.push({ file: file.filename, line: currentLine });
        currentLine++;
      } else if (!line.startsWith("-")) {
        currentLine++;
      }
    });
  });
  return changes;
}

async function postPRComment(
  githubToken,
  prDetails,
  comment,
  line,
  file,
  commitId
) {
  const url = `https://api.github.com/repos/${prDetails.owner}/${prDetails.repo}/pulls/${prDetails.prNumber}/comments`;
  const body = {
    body: comment,
    path: file,
    commit_id: commitId,
    line,
    side: "RIGHT",
  };
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("Failed to post comment:", await response.json());
    alert(`Failed to post comment on ${file}.`);
  }
}

// Export for testing in Node environment
if (typeof module !== "undefined") {
  module.exports = { extractChangesFromDiff, extractPRDetails };
}
