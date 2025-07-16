document.getElementById("run-review").addEventListener("click", async () => {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    const pr = extractPRDetails(tab.url);
    if (!pr) {
      alert("Not a GitHub PR page");
      return;
    }
    chrome.storage.local.get(["githubToken"], async (result) => {
      if (!result.githubToken) {
        alert("GitHub token not found. Set it in settings.");
        return;
      }
      const diffs = await fetchPRDiffs(pr, result.githubToken);
      console.log("Diffs:", diffs);
      const commitId = await getPRCommitId(pr, result.githubToken);
      for (const file of diffs) {
        const suggestions = await analyzeDiffWithOpenAI(file.patch);
        const changes = extractChangesFromDiff([file]);
        if (changes.length > 0) {
          const change = changes[0];
          await postPRComment(
            result.githubToken,
            pr,
            suggestions,
            change.line,
            change.file,
            commitId
          );
        }
      }
      chrome.tabs.reload();
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
    return [];
  }
  const files = await response.json();
  return files.map((f) => ({ filename: f.filename, patch: f.patch }));
}

async function getPRCommitId(pr, token) {
  const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.prNumber}`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${token}` },
  });
  const data = await response.json();
  return data.head.sha;
}

async function analyzeDiffWithOpenAI(patch) {
  // Placeholder: replace with actual OpenAI API call
  return `Review suggestions for patch:\n${patch.slice(0, 100)}...`;
}

async function postPRComment(token, pr, comment, line, file, commitId) {
  const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.prNumber}/comments`;
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
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!data.id) {
    console.error("Failed to post comment", data);
  }
}

function extractChangesFromDiff(diffData) {
  const changes = [];
  diffData.forEach((file) => {
    const lines = file.patch.split("\n");
    let current = 0;
    lines.forEach((line) => {
      if (line.startsWith("@@")) {
        const m = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (m) current = parseInt(m[1]);
      } else if (!line.startsWith("+++") && !line.startsWith("---")) {
        if (line.startsWith("+")) {
          changes.push({
            file: file.filename,
            line: current,
            change: line.slice(1).trim(),
          });
          current++;
        } else {
          current++;
        }
      }
    });
  });
  return changes;
}
