const GITHUB_API_URL = "https://api.github.com";

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
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({ body }),
    },
  );
  return handleGitHubResponse(res);
}
