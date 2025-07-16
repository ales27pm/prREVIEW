const GITHUB_API_URL = "https://api.github.com";

/**
 * Processes a fetch response from the GitHub API, throwing descriptive errors for authentication, access, or other HTTP failures.
 * @param {Response} res - The fetch response object to evaluate.
 * @returns {Promise<any>} The parsed JSON body if the response is successful.
 * @throws {Error} If the response indicates authentication failure (401), access forbidden or rate limiting (403), or any other non-OK status.
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
  return res.json();
}

/**
 * Retrieves all files changed in a specific pull request, handling pagination up to a set limit.
 * @param {Object} params - The pull request details.
 * @param {string} params.owner - The repository owner's username.
 * @param {string} params.repo - The repository name.
 * @param {number} params.prNumber - The pull request number.
 * @param {string} token - GitHub personal access token for authentication.
 * @return {Promise<Array>} A promise that resolves to an array of file objects changed in the pull request.
 */
export async function fetchAllPRFiles({ owner, repo, prNumber }, token) {
  const files = [];
  const perPage = 100;
  let page = 1;
  const maxPages = 50;

  while (page <= maxPages) {
    const res = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
      { headers: { Authorization: `token ${token}` } }
    );
    const data = await handleStatus(res);
    files.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  if (page > maxPages) {
    console.warn(
      `Reached maximum page limit (${maxPages}) while fetching PR files`
    );
  }
  return files;
}

/**
 * Retrieves metadata for a specific pull request from the GitHub API.
 * @param {Object} params - The pull request identification details.
 * @param {string} params.owner - The repository owner's username.
 * @param {string} params.repo - The repository name.
 * @param {number} params.prNumber - The pull request number.
 * @param {string} token - GitHub personal access token for authentication.
 * @return {Promise<Object>} The pull request metadata as returned by the GitHub API.
 */
export async function getPRData({ owner, repo, prNumber }, token) {
  const res = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${repo}/pulls/${prNumber}`,
    { headers: { Authorization: `token ${token}` } }
  );
  return handleStatus(res);
}

/**
 * Posts a review comment on a specific line of a pull request file in GitHub.
 * 
 * Sends a comment to the specified commit and file within a pull request, targeting a particular line on the "RIGHT" side of the diff.
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
