document.getElementById("run-review").addEventListener("click", runReview);

async function runReview() {
  try {
    const tab = await queryActiveTab();
    const pr = extractPRDetails(tab.url);
    if (!pr) {
      alert("Not a GitHub PR page");
      return;
    }

    const token = await getGitHubToken();
    if (!token) {
      alert("GitHub token not found. Set it in settings.");
      return;
    }
    const openaiKey = await getOpenAIKey();
    if (!openaiKey) {
      alert("OpenAI key not found. Set it in settings.");
      return;
    }

    const diffs = await fetchPRDiffs(pr, token);
    const commitId = await getPRCommitId(pr, token);

    for (const file of diffs) {
      try {
        const suggestions = await analyzeDiffWithOpenAI(file.patch, openaiKey);
        const changes = extractChangesFromDiff([file]);
        for (const change of changes) {
          await postPRComment(
            token,
            pr,
            suggestions,
            change.line,
            change.file,
            commitId,
          );
        }
      } catch (err) {
        console.error("Failed processing file", file.filename, err);
      }
    }

    if (confirm("Comments posted. Reload the PR page?")) {
      chrome.tabs.reload();
    }
  } catch (err) {
    console.error("Review failed", err);
    alert("An error occurred during review. See console for details.");
  }
}

function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]);
    });
  });
}

function getGitHubToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["githubToken"], (result) => {
      resolve(result.githubToken);
    });
  });
}

function getOpenAIKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openaiKey"], (result) => {
      resolve(result.openaiKey);
    });
  });
}

document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

function extractPRDetails(url) {
  // Remove query parameters and fragments
  const normalizedUrl = url.split(/[?#]/)[0];
  const cleanUrl = normalizedUrl.replace(/\/$/, "");
  const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: match[3] };
}

async function fetchPRDiffs({ owner, repo, prNumber }, token) {
  const perPage = 100;
  let page = 1;
  const files = [];
  try {
    while (true) {
      const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!response.ok) {
        console.error("Failed to fetch PR diffs:", response.status);
        break;
      }
      const batch = await response.json();
      files.push(...batch);
      if (batch.length < perPage) break;
      page++;
    }
  } catch (err) {
    console.error("Error fetching PR diffs", err);
  }
  return files
    .filter((f) => f.patch)
    .map((f) => ({ filename: f.filename, patch: f.patch }));
}

async function getPRCommitId(pr, token) {
  try {
    const url = `https://api.github.com/repos/${pr.owner}/${pr.repo}/pulls/${pr.prNumber}`;
    const response = await fetch(url, {
      headers: { Authorization: `token ${token}` },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch PR data: ${response.status}`);
    }
    const data = await response.json();
    return data.head.sha;
  } catch (err) {
    console.error("Failed to get PR commit id", err);
    throw err;
  }
}

async function analyzeDiffWithOpenAI(patch, apiKey) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: `Provide a short review for the following diff:\n${patch}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.2,
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error("OpenAI analysis failed", err);
    throw err;
  }
}

async function postPRComment(token, pr, comment, line, file, commitId) {
  try {
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
  } catch (err) {
    console.error("Error posting PR comment", err);
    throw err;
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
