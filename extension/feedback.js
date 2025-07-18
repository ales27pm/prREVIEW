// extension/feedback.js
import * as github from "./githubApi.js";
import { loadConfig, getRagMode } from "./config.js";
import { generateAstDiff } from "./utils/astDiff.js";

const STORAGE_KEY = "aiFeedback";
let styleInjected = false;
const DEFAULT_FEEDBACK_ENDPOINT = "http://localhost:3000/feedback";

async function sendFeedback(record) {
  try {
    const config = await loadConfig();
    const url = config.feedbackUrl || DEFAULT_FEEDBACK_ENDPOINT;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
  } catch (e) {
    console.error("Failed to send feedback", e);
  }
}

function injectStyle() {
  if (styleInjected) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("feedback.css");
  document.head.appendChild(link);
  styleInjected = true;
}

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
      await sendFeedback(rec);
    }
  } catch (error) {
    console.error("Failed to save rating", error);
    throw error;
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
      await sendFeedback(r);
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

export async function fetchSuggestions() {
  try {
    const mode = await getRagMode();
    const config = await loadConfig();
    const response = await fetch(`${config.feedbackUrl}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    if (!response.ok) {
      throw new Error(`Suggest API failed: ${response.status}`);
    }
    const data = await response.json();
    const enriched = (data.suggestions || []).map((s) => {
      try {
        return {
          ...s,
          diff: generateAstDiff(s.before, s.after, s.file),
        };
      } catch (err) {
        console.error("Failed to diff suggestion", err);
        return { ...s, diff: "" };
      }
    });
    return enriched.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error("Failed to fetch suggestions", err);
    return [];
  }
}
