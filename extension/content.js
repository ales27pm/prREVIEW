// extension/content.js
import * as ui from "./ui.js";
import * as github from "./githubApi.js";
import * as openai from "./openaiApi.js";
import { loadConfig } from "./config.js";
import * as feedback from "./feedback.js";
import pLimit from "./p-limit.js";

const MAX_COMMENT_LENGTH = 65000;

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
    config.prTitle = prData.title;
    config.prBody = prData.body || "";

    const filesToReview = files.filter(
      (file) => file.patch && file.status !== "removed",
    );
    if (filesToReview.length === 0) {
      ui.updateStatus("No reviewable file changes found.", {
        isComplete: true,
      });
      return;
    }

    // Validate concurrencyLimit to be a positive integer between 1 and 20
    let concurrencyLimit = parseInt(config.concurrencyLimit, 10);
    if (
      isNaN(concurrencyLimit) ||
      concurrencyLimit < 1 ||
      concurrencyLimit > 20
    ) {
      console.warn(
        `[AI Review] Invalid concurrencyLimit (${config.concurrencyLimit}), using default value of 5 (allowed range: 1-20).`,
      );
      concurrencyLimit = 5;
    }
    const limit = pLimit(concurrencyLimit);
    let filesAnalyzed = 0;
    const reviewErrors = [];
    const postedComments = [];
    const summary = [];

    const reviewPromises = filesToReview.map((file) =>
      limit(async () => {
        try {
          ui.updateStatus(
            `Analyzing files... (${filesAnalyzed + 1}/${filesToReview.length})`,
          );
          const feedback = await openai.getReviewForPatch(file.patch, config);
          if (
            feedback &&
            Array.isArray(feedback.comments) &&
            feedback.comments.length > 0
          ) {
            for (const comment of feedback.comments) {
              const body = `AI Suggestion: ${comment.body}`;
              const postedComment = await github.postComment({
                prDetails,
                token: config.githubToken,
                commitId,
                file,
                comment: { ...comment, body },
              });
              if (postedComment) {
                postedComments.push(postedComment);
                feedback.recordComment({
                  owner: prDetails.owner,
                  repo: prDetails.repo,
                  prNumber: prDetails.prNumber,
                  commentId: postedComment.id,
                });
              }
            }
            const summaryLines = feedback.comments
              .map((c) => `- Line ${c.line}: ${c.body}`)
              .join("\n");
            summary.push(`### ${file.filename}\n${summaryLines}`);
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
    feedback.observeComments();
    feedback.startMergeTracker(prDetails, config.githubToken);

    if (summary.length > 0) {
      let summaryBody = `${github.SUMMARY_HEADER}\n${summary.join("\n\n")}`;
      const notice = "\n\n...summary truncated due to length";
      if (summaryBody.length > MAX_COMMENT_LENGTH) {
        summaryBody =
          summaryBody.slice(0, MAX_COMMENT_LENGTH - notice.length) + notice;
      }

      try {
        await github.postSummaryComment({
          prDetails,
          token: config.githubToken,
          body: summaryBody,
        });
      } catch (error) {
        console.error("Failed to post summary comment:", error);
      }
    }

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
