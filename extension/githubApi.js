const GITHUB_API_URL = "https://api.github.com";
import { parsePatch, applyPatch as applyTextPatch } from "diff";
import { loadConfig } from "./config.js";
export const SUMMARY_HEADER = "<!-- ai-review-summary -->";

/**
 * Processes a GitHub API HTTP response, throwing descriptive errors for authentication, rate limiting, permission, or missing resource issues, and returns the parsed JSON body or null for empty responses.
 * @param {Response} res - The HTTP response from a GitHub API request.
 * @return {Object|null} The parsed JSON body, or null if the response is empty.
 */
async function handleGitHubResponse(res) {
  if (res.status === 401) {
    throw new Error(
      "GitHub API: Authentication failed. Please check your token in the options.",
    );
  }

  if (res.status === 403) {
    const rateLimitRemaining = res.headers.get("x-ratelimit-remaining");
    if (rateLimitRemaining && parseInt(rateLimitRemaining, 10) === 0) {
      const resetTime = new Date(
        parseInt(res.headers.get("x-ratelimit-reset"), 10) * 1000,
      );
      throw new Error(
        `GitHub API: Rate limit exceeded. Please wait until ${resetTime.toLocaleTimeString()}.`,
      );
    }
    throw new Error(
      "GitHub API: Access forbidden. Your token may lack the required permissions for this repository.",
    );
  }

  if (res.status === 404) {
    throw new Error(
      "GitHub API: Resource not found. The repository or PR may not exist.",
    );
  }

  if (!res.ok) {
    const errorBody = await res
      .text()
      .catch(() => "Could not read error body.");
    throw new Error(
      `GitHub API Error: ${res.status} ${res.statusText}. Response: ${errorBody}`,
    );
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null;
  }

  return res.json();
}

/**
 * Fetches all files changed in a specified GitHub pull request, handling pagination to ensure the complete list is returned.
 * @param {Object} params - Identifies the pull request.
 * @param {string} params.owner - The repository owner's username.
 * @param {string} params.repo - The repository name.
 * @param {number} params.prNumber - The pull request number.
 * @param {string} token - The GitHub API authentication token.
 * @return {Promise<Array>} Resolves to an array of file objects representing all files changed in the pull request.
 */
export async function fetchAllPRFiles({ owner, repo, prNumber }, token) {
  const allFiles = [];
  const perPage = 100;
  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    const url = `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    const files = await handleGitHubResponse(res);

    if (files && Array.isArray(files)) {
      allFiles.push(...files);
      if (files.length < perPage) {
        keepFetching = false;
      } else {
        page++;
      }
    } else {
      keepFetching = false;
    }
  }
  return allFiles;
}

/**
 * Retrieves metadata for a specific pull request from the GitHub API.
 * @param {Object} params - The pull request identification details.
 * @param {string} params.owner - The repository owner's username.
 * @param {string} params.repo - The repository name.
 * @param {number} params.prNumber - The pull request number.
 * @param {string} token - The GitHub API access token.
 * @return {Promise<Object|null>} The pull request data as an object, or null if the response is empty.
 */
export async function getPRData({ owner, repo, prNumber }, token) {
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  return handleGitHubResponse(res);
}

/**
 * Posts a review comment to a specific line of a file in a pull request.
 * @returns {Promise<Object|null>} The created comment object from the GitHub API, or null if the response is empty.
 */
export async function postComment({
  prDetails,
  token,
  commitId,
  file,
  comment,
}) {
  const { owner, repo, prNumber } = prDetails;
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        body: comment.body,
        commit_id: commitId,
        path: file.filename,
        line: comment.line,
        side: "RIGHT",
      }),
    },
  );
  return handleGitHubResponse(res);
}

/**
 * Posts a summary comment to the pull request conversation.
 * @param {Object} params
 * @param {{owner:string, repo:string, prNumber:number}} params.prDetails
 * @param {string} params.token
 * @param {string} params.body
 * @returns {Promise<Object|null>} The created comment object or null.
 */
export async function postSummaryComment({ prDetails, token, body }) {
  const { owner, repo, prNumber } = prDetails;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github.v3+json",
  };

  const listRes = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
    {
      headers,
    },
  );
  const comments = await handleGitHubResponse(listRes);
  const existing =
    Array.isArray(comments) &&
    comments.find((c) => c.body && c.body.startsWith(SUMMARY_HEADER));

  if (existing) {
    const res = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/comments/${existing.id}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      },
    );
    return handleGitHubResponse(res);
  }

  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ body }),
    },
  );
  return handleGitHubResponse(res);
}

/**
 * Retrieve a single review comment by ID.
 * @param {{owner:string, repo:string, commentId:number}} params
 * @param {string} token
 * @returns {Promise<Object|null>}
 */
export async function getReviewComment({ owner, repo, commentId }, token) {
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/comments/${commentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    },
  );
  return handleGitHubResponse(res);
}

function toBase64(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str, "utf8").toString("base64");
  }
  return btoa(unescape(encodeURIComponent(str)));
}

export async function applyPatch({ owner, repo, prNumber, token, patchText }) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
  };

  try {
    const prRes = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}`,
      { headers },
    );
    const pr = await handleGitHubResponse(prRes);

    const headSha = pr.head.sha;
    const branch = pr.head.ref;

    const headCommitRes = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits/${headSha}`,
      { headers },
    );
    const headCommit = await handleGitHubResponse(headCommitRes);

    const baseTreeRes = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees/${headCommit.tree.sha}?recursive=1`,
      { headers },
    );
    const baseTree = await handleGitHubResponse(baseTreeRes);

    let patches;
    try {
      patches = parsePatch(patchText);
    } catch (err) {
      throw new Error("Failed to parse patch text");
    }
    const treeUpdates = [];

    for (const p of patches) {
      const pathName = p.newFileName || p.oldFileName;
      const entry = baseTree.tree.find((t) => t.path === pathName);
      let original = "";
      if (entry) {
        const blob = await fetch(
          `${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs/${entry.sha}`,
          { headers },
        ).then(handleGitHubResponse);
        original = Buffer.from(blob.content, "base64").toString("utf8");
      }
      const updated = applyTextPatch(original, p);
      const newBlob = await fetch(
        `${GITHUB_API_URL}/repos/${owner}/${repo}/git/blobs`,
        {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            content: toBase64(updated),
            encoding: "base64",
          }),
        },
      ).then(handleGitHubResponse);
      treeUpdates.push({
        path: pathName,
        mode: "100644",
        type: "blob",
        sha: newBlob.sha,
      });
    }

    const newTree = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/trees`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          base_tree: headCommit.tree.sha,
          tree: treeUpdates,
        }),
      },
    ).then(handleGitHubResponse);

    const newCommit = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/commits`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Apply AI suggestion",
          tree: newTree.sha,
          parents: [headSha],
        }),
      },
    ).then(handleGitHubResponse);

    await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
      {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ sha: newCommit.sha }),
      },
    ).then(handleGitHubResponse);

    const config = await loadConfig();
    const metricsUrl = `${config.feedbackUrl.replace(/\/feedback$/, "")}/metrics`;
    const metricsRes = await fetch(metricsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "patch_applied",
        pr: prNumber,
        user: pr.user.login,
      }),
    });
    if (!metricsRes.ok) {
      console.error("Metrics request failed", metricsRes.status);
    }

    return newCommit;
  } catch (err) {
    console.error("Failed to apply patch", err);
    throw err;
  }
}
