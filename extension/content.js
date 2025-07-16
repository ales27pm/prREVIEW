// extension/content.js
import * as ui from "./ui.js";
import * as github from "./githubApi.js";
import * as openai from "./openaiApi.js";
import pLimit from "./p-limit.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "run_review") {
    runReviewFlow(request.prDetails);
    sendResponse({ status: "Review started" });
  }
  return true;
});

/**
 * Orchestrates the AI-powered code review process for a pull request, including UI updates, token validation, file analysis with concurrency limits, and posting review comments.
 * 
 * Initiates the review by updating the UI, retrieves necessary API tokens, fetches pull request files and metadata, and analyzes each changed file using the OpenAI API. Posts AI-generated review comments to GitHub and updates the UI to reflect progress and completion. Handles errors gracefully, ensuring the review process continues for remaining files even if some fail.
 * 
 * @param {object} prDetails - Details of the pull request to review.
 */
async function runReviewFlow(prDetails) {
  ui.createStatusIndicator();
  ui.updateStatus("Starting AI review...");

  try {
    const { githubToken, openAIApiKey } = await chrome.storage.local.get([
      "githubToken",
      "openAIApiKey",
    ]);

    if (!githubToken) {
      ui.updateStatus(
        "GitHub Token is missing. Please configure it in the extension options.",
        true
      );
      return;
    }
    if (!openAIApiKey) {
      ui.updateStatus(
        "OpenAI API Key is missing. Please configure it in the extension options.",
        true
      );
      return;
    }

    ui.updateStatus("Fetching PR data...");
    const files = await github.fetchAllPRFiles(prDetails, githubToken);
    const prData = await github.getPRData(prDetails, githubToken);
    const commitId = prData.head.sha;

    const filesToReview = files.filter((file) => file.patch);
    if (filesToReview.length === 0) {
      ui.updateStatus("No files with changes found to review.", false, true);
      setTimeout(() => ui.removeStatusIndicator(), 3000);
      return;
    }

    const limit = pLimit(5);
    let filesAnalyzed = 0;

    const reviewPromises = filesToReview.map((file) =>
      limit(async () => {
        try {
          const feedback = await openai.getReviewForPatch(
            file.patch,
            openAIApiKey
          );
          if (feedback.comments && feedback.comments.length > 0) {
            const commentPromises = feedback.comments.map((comment) =>
              github.postComment({
                prDetails,
                token: githubToken,
                commitId,
                file,
                comment,
              })
            );
            await Promise.all(commentPromises);
          }
        } catch (error) {
          console.error(`Failed to process file ${file.filename}:`, error);
        } finally {
          filesAnalyzed++;
          ui.updateStatus(
            `Analyzing files... (${filesAnalyzed}/${filesToReview.length})`
          );
        }
      })
    );

    await Promise.all(reviewPromises);

    ui.updateStatus("Review complete! Reloading...", false, true);
    setTimeout(() => window.location.reload(), 2000);
  } catch (error) {
    console.error("PR Review Flow Error:", error);
    ui.updateStatus(`Error: ${error.message}`, true);
  }
}
