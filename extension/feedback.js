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

export async function recordComment({ owner, repo, prNumber, commentId }) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = data[STORAGE_KEY] || [];
  list.push({ owner, repo, prNumber, commentId, rating: null, adopted: null });
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

export async function saveRating(commentId, rating) {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const list = data[STORAGE_KEY] || [];
  const rec = list.find((r) => r.commentId === commentId);
  if (rec) {
    rec.rating = rating;
    await chrome.storage.local.set({ [STORAGE_KEY]: list });
  }
}

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
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

export function startMergeTracker(prDetails, token) {
  const interval = setInterval(async () => {
    try {
      const pr = await github.getPRData(prDetails, token);
      if (pr && pr.merged_at) {
        clearInterval(interval);
        await updateAdoption(prDetails, token);
      }
    } catch (e) {
      console.error("Merge check failed", e);
    }
  }, 60000);
}

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
  up.addEventListener("click", () => saveRating(parseInt(commentId, 10), "up"));
  down.addEventListener("click", () =>
    saveRating(parseInt(commentId, 10), "down"),
  );
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
