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
