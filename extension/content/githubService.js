// extension/content/githubService.js

/**
 * Extracts the raw diff text of this PR from GitHub's page.
 */
export function getPageDiff() {
  const diffBtn = document.querySelector('[aria-label="Copy diff"]');
  if (!diffBtn) throw new Error("Cannot find diff button");
  diffBtn.click();
  return navigator.clipboard.readText();
}

/**
 * (Optional) Posts review comments back via GitHub REST.
 * You'll need a PAT in storage and the octokit REST client.
 */
import { Octokit } from "@octokit/rest";
import { loadSettings } from "../settings.js";

export async function postReviewComments(comments) {
  const settings = await loadSettings();
  const octo = new Octokit({ auth: settings.githubToken });
  const { owner, repo, number } = parsePRfromURL(location.href);
  for (const comment of comments) {
    await octo.pulls.createReview({
      owner,
      repo,
      pull_number: number,
      body: comment,
    });
  }
}

/**
 * Parses a GitHub PR URL and extracts the owner, repo, and PR number.
 * Supports both github.com and enterprise GitHub URLs.
 * Returns { owner, repo, number } or throws if the URL is invalid.
 */
function parsePRfromURL(url) {
  const pathname = new URL(url).pathname;
  const match = pathname.match(/^\/([^\/]+)\/([^\/]+)\/pulls?\/(\d+)(\/|$)/);
  if (!match) {
    throw new Error(`Invalid GitHub PR URL: ${url}`);
  }
  const [, owner, repo, pr] = match;
  return { owner, repo, number: Number(pr) };
}
