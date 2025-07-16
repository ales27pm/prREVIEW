const GITHUB_API_URL = "https://api.github.com";

/**
 * Handles a GitHub API HTTP response, throwing errors for authentication or access issues, and returns parsed JSON data or null if the response is empty.
 * @param {Response} res - The HTTP response from a GitHub API request.
 * @return {Object|null} The parsed JSON body, or null if the response has no content.
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
 * Retrieves all files changed in a GitHub pull request by paginating through the API until all results are collected.
 * @param {Object} params - Details identifying the pull request.
 * @param {string} params.owner - The repository owner's username.
 * @param {string} params.repo - The repository name.
 * @param {number} params.prNumber - The pull request number.
 * @param {string} token - The GitHub API authentication token.
 * @return {Promise<Array>} A promise that resolves to an array of file objects changed in the pull request.
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
