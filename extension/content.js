// extension/content.js
import * as ui from "./ui.js";
import * as github from "./githubApi.js";
import * as openai from "./openaiApi.js";
import { loadConfig } from "./config.js";
import pLimit from "./p-limit.js";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "run_review") {
    runReviewFlow(request.prDetails);
    sendResponse({ status: "Review started" });
  }
  return true;
});

/**
 * Runs the AI-powered code review flow for a given GitHub pull request.
 *
 * Orchestrates the process of loading configuration, fetching PR data, filtering files, generating AI review feedback, posting comments, and updating the UI with progress and results. Handles errors at each stage and provides user feedback through the UI.
 * @param {object} prDetails - Details of the pull request to review.
 */
async function runReviewFlow(prDetails) {
  ui.createStatusIndicator();
  ui.updateStatus("Initializing AI review...");

  try {
    const config = await loadConfig();
    if (config.error) {
      ui.updateStatus(config.error, { isError: true });
      return;
    }

    ui.updateStatus("Fetching PR data...");
    const [files, prData] = await Promise.all([
      github.fetchAllPRFiles(prDetails, config.githubToken),
      github.getPRData(prDetails, config.githubToken),
    ]);
    const commitId = prData.head.sha;

    const filesToReview = files.filter(
      (file) => file.patch && file.status !== "removed",
    );
    if (filesToReview.length === 0) {
      ui.updateStatus("No reviewable file changes found.", {
        isComplete: true,
      });
      return;
    }

    const limit = pLimit(config.concurrencyLimit);
    let filesAnalyzed = 0;
    const reviewErrors = [];
    const postedComments = [];

    const reviewPromises = filesToReview.map((file) =>
      limit(async () => {
        try {
          ui.updateStatus(
            `Analyzing files... (${filesAnalyzed + 1}/${filesToReview.length})`,
          );
          const feedback = await openai.getReviewForPatch(file.patch, config);
          if (feedback && feedback.comments && feedback.comments.length > 0) {
            for (const comment of feedback.comments) {
              const postedComment = await github.postComment({
                prDetails,
                token: config.githubToken,
                commitId,
                file,
                comment,
              });
              if (postedComment) {
                postedComments.push(postedComment);
              }
            }
          }
        } catch (error) {
          console.error(`Failed to process file ${file.filename}:`, error);
          reviewErrors.push(`- ${file.filename}: ${error.message}`);
        } finally {
          filesAnalyzed++;
        }
      }),
    );

    await Promise.all(reviewPromises);

    if (reviewErrors.length > 0) {
      const errorMessage = `Review complete with ${reviewErrors.length} error(s). See console for details.`;
      ui.updateStatus(errorMessage, { isError: true });
    } else {
      ui.updateStatus(
        `Review complete! ${postedComments.length} comments posted.`,
        { isComplete: true },
      );
    }
  } catch (error) {
    console.error(
      "A critical error occurred during the PR Review Flow:",
      error,
    );
    ui.updateStatus(`Error: ${error.message}`, { isError: true });
  }
}
