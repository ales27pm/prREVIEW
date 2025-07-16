// extension/utils.js

/**
 * Extract owner, repo and PR number from a GitHub pull request URL.
 * @param {string} url
 * @returns {{owner: string, repo: string, prNumber: number}|null}
 */
function extractPRDetails(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const segments = parsed.pathname.split("/").filter(Boolean);
    const pullIndex = segments.indexOf("pull");
    if (pullIndex !== 2 || segments.length < 4) return null;
    const prNumber = parseInt(segments[3], 10);
    if (Number.isNaN(prNumber)) return null;
    return { owner: segments[0], repo: segments[1], prNumber };
  } catch {
    return null;
  }
}

export { extractPRDetails };

// Support CommonJS for Jest
if (typeof module !== "undefined") {
  module.exports = { extractPRDetails };
}
