/**
 * Extracts the owner, repository name, and pull request number from a GitHub pull request URL.
 *
 * @param {string} url - The GitHub pull request URL to parse.
 * @return {{ owner: string, repo: string, prNumber: number } | null} An object with the owner, repository name, and pull request number if the URL is valid, or null if the URL is invalid or does not match the expected GitHub pull request format.
 */
function extractPRDetails(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return null;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const pullIndex = segments.indexOf('pull');
    if (pullIndex !== 2 || segments.length < 4) return null;
    const prNumber = parseInt(segments[3], 10);
    if (Number.isNaN(prNumber)) return null;
    return { owner: segments[0], repo: segments[1], prNumber };
  } catch {
    return null;
  }
}
module.exports = { extractPRDetails };
