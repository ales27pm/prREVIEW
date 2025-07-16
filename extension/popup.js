// extension/popup.js

document.getElementById("run-review").addEventListener("click", async () => {
  const reviewButton = document.getElementById("run-review");
  reviewButton.disabled = true;
  reviewButton.textContent = "Running...";

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];

    const prDetails = extractPRDetails(tab.url);
    if (!prDetails) {
      alert("Not a valid GitHub PR page!");
      reviewButton.disabled = false;
      reviewButton.textContent = "Run Review";
      return;
    }

    chrome.storage.local.get(["githubToken"], async (result) => {
      if (!result.githubToken) {
        alert(
          "GitHub token not found. Please set it in the extension settings."
        );
        chrome.runtime.openOptionsPage();
        reviewButton.disabled = false;
        reviewButton.textContent = "Run Review";
        return;
      }

      try {
        const diffs = await fetchPRDiffs(prDetails, result.githubToken);
        if (diffs.length === 0) {
          reviewButton.disabled = false;
          reviewButton.textContent = "Run Review";
          return;
        }

        const commitId = await getPRCommitId(prDetails, result.githubToken);

        for (const file of diffs) {
          const suggestions = await analyzeDiffWithOpenAI(file.patch);
          if (!suggestions) continue;

          const changes = extractChangesFromDiff([file]);
          if (changes.length > 0) {
            const firstChange = changes[0];
            await postPRComment(
              result.githubToken,
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
        reviewButton.disabled = false;
        reviewButton.textContent = "Run Review";
      }
    });
  });
});

document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function extractPRDetails(url) {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: match[3] };
}

async function fetchPRDiffs({ owner, repo, prNumber }, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
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
  position,
  file,
  commitId
) {
  const url = `https://api.github.com/repos/${prDetails.owner}/${prDetails.repo}/pulls/${prDetails.prNumber}/comments`;
  const body = {
    body: comment,
    path: file,
    commit_id: commitId,
    line: position,
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
