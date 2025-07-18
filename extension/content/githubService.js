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
  const octo = new Octokit({ auth: settings.openAIApiKey });
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

function parsePRfromURL(url) {
  const [, , owner, repo, , pr] = new URL(url).pathname.split("/");
  return { owner, repo, number: Number(pr) };
}
