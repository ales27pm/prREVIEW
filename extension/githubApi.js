const GITHUB_API_URL = "https://api.github.com";

/**
 * Handles a GitHub API HTTP response, throwing errors for authentication or access issues, and returns parsed JSON data or null if the response is empty.
 * @param {Response} res - The HTTP response from a GitHub API request.
 * @return {Object|null} The parsed JSON body, or null if the response has no content.
 */
function handleStatus(res) {
  if (res.status === 401) {
    throw new Error("GitHub API: Authentication failed. Check your token.");
  }
  if (res.status === 403) {
    throw new Error("GitHub API: Access forbidden or rate limited.");
  }
  if (!res.ok) {
    throw new Error(`GitHub API: ${res.status} ${res.statusText}`);
  }

  // Handle 204 No Content or other responses without body
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
  const files = [];
  const perPage = 100;
  let page = 1;
  let keepFetching = true;

  while (keepFetching) {
    const res = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    const data = await handleStatus(res);
    files.push(...data);
    if (data.length < perPage) {
      keepFetching = false;
    } else {
      page++;
    }
  }
  return files;
}

export async function getPRData({ owner, repo, prNumber }, token) {
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { Authorization: `token ${token}` } }
  );
  return handleStatus(res);
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
        Authorization: `token ${token}`,
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
  await handleStatus(res);
}
