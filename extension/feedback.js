// extension/feedback.js
import * as github from "./githubApi.js";

const STORAGE_KEY = "aiFeedback";
let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("feedback.css");
  document.head.appendChild(link);
  styleInjected = true;
}

/**
 * Records a new AI-generated review comment for feedback tracking in local storage.
 * 
 * Adds a comment entry with the specified repository and pull request details, initializing its rating and adoption status as null.
 * @param {Object} params - The comment details.
 * @param {string} params.owner - Repository owner.
 * @param {string} params.repo - Repository name.
 * @param {number} params.prNumber - Pull request number.
 * @param {number|string} params.commentId - Unique identifier for the comment.
 */
export async function recordComment({ owner, repo, prNumber, commentId }) {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const list = data[STORAGE_KEY] || [];
    list.push({
      owner,
      repo,
      prNumber,
      commentId,
      rating: null,
      adopted: null,
    });
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  } catch (error) {
    console.error("Failed to record comment", error);
    throw error;
  }
}

export async function saveRating(commentId, rating) {
  if (!commentId || !["up", "down"].includes(rating)) {
    throw new Error("Invalid commentId or rating");
  }

  try {
    const data = await chrome.storage.local.get(STORAGE_KEY);
    const list = data[STORAGE_KEY] || [];
    const rec = list.find((r) => r.commentId === commentId);
    if (rec) {
      rec.rating = rating;
      await chrome.storage.local.set({ [STORAGE_KEY]: list });
    }
  } catch (error) {
    console.error("Failed to save rating", error);
    throw error;
  }
}

/**
 * Updates the adoption status of AI-generated review comments for a specific pull request.
 *
 * For each feedback record matching the given PR details, fetches the corresponding GitHub review comment and sets its `adopted` field to `true` if the comment's `position` is `null` (indicating the suggestion was adopted), or `false` otherwise. Saves the updated feedback data to local storage.
 */
async function updateAdoption(prDetails, token) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = data[STORAGE_KEY] || [];
  const relevant = list.filter(
    (r) =>
      r.owner === prDetails.owner &&
      r.repo === prDetails.repo &&
      r.prNumber === prDetails.prNumber,
  );
  for (const r of relevant) {
    try {
      const comment = await github.getReviewComment(
        {
          owner: prDetails.owner,
          repo: prDetails.repo,
          commentId: r.commentId,
        },
        token,
      );
      if (comment && comment.position === null) {
        r.adopted = true;
      } else {
        r.adopted = false;
      }
    } catch (e) {
      console.error("Failed to check comment adoption", e);
    }
  }
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  } catch (error) {
    console.error("Failed to update adoption status", error);
  }
}

/**
 * Starts a periodic check to detect when a pull request is merged and updates adoption status for related AI-generated comments.
 *
 * Sets an interval to poll the GitHub API every 60 seconds for the merge status of the specified pull request. When the PR is detected as merged, the interval is cleared and `updateAdoption` is called to update feedback records for AI-generated comments on that PR.
 *
 * @param {Object} prDetails - Details identifying the pull request (owner, repo, prNumber).
 * @param {string} token - GitHub API authentication token.
 * @return {number} The interval ID for the periodic merge check.
 */
export function startMergeTracker(prDetails, token) {
  const interval = setInterval(async () => {
    try {
      const pr = await github.getPRData(prDetails, token);
      if (pr?.merged_at) {
        clearInterval(interval);
        await updateAdoption(prDetails, token);
      }
    } catch (e) {
      console.error("Merge check failed", e);
    }
  }, 60000);
  return interval;
}

/**
 * Adds thumbs-up and thumbs-down feedback buttons to a comment body element for AI-generated suggestions.
 * 
 * If feedback buttons are not already present, creates and appends them to the specified comment body. Handles user clicks to record feedback ratings.
 * @param {Element} bodyEl - The DOM element representing the comment body.
 * @param {string|number} commentId - The identifier of the comment to associate feedback with.
 */
function addButtons(bodyEl, commentId) {
  injectStyle();
  if (bodyEl.querySelector(".ai-feedback-buttons")) return;
  const container = document.createElement("div");
  container.className = "ai-feedback-buttons";
  const up = document.createElement("button");
  up.textContent = "\uD83D\uDC4D"; // thumbs up
  const down = document.createElement("button");
  down.textContent = "\uD83D\uDC4E"; // thumbs down
  container.appendChild(up);
  container.appendChild(down);
  up.addEventListener("click", async () => {
    try {
      const id = parseInt(commentId, 10);
      if (isNaN(id)) throw new Error("Invalid comment ID");
      await saveRating(id, "up");
    } catch (error) {
      console.error("Failed to save thumbs up rating", error);
    }
  });
  down.addEventListener("click", async () => {
    try {
      const id = parseInt(commentId, 10);
      if (isNaN(id)) throw new Error("Invalid comment ID");
      await saveRating(id, "down");
    } catch (error) {
      console.error("Failed to save thumbs down rating", error);
    }
  });
  bodyEl.appendChild(container);
}

function attachButtons() {
  const containers = document.querySelectorAll(".js-comment-container");
  containers.forEach((c) => {
    const id = c.getAttribute("data-comment-id");
    const body = c.querySelector(".js-comment-body");
    if (!id || !body) return;
    const text = body.textContent || "";
    if (text.trim().startsWith("AI Suggestion:")) {
      addButtons(body, id);
    }
  });
}

export function observeComments() {
  attachButtons();
  const observer = new MutationObserver(attachButtons);
  observer.observe(document.body, { childList: true, subtree: true });
  return observer;
}
