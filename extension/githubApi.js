const GITHUB_API_URL = "https://api.github.com";

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
