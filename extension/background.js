// extension/background.js
import { getPageDiff, postReviewComments } from "./content/githubService.js";
import { getReviewForPatch } from "./llmApi.js";
import { loadSettings } from "./settings.js";
import { getPRDetails } from "./utils.js";

// Existing context menu to start review from page or toolbar
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "review-pr",
    title: "Run AI Review on this PR",
    contexts: ["page"],
    documentUrlPatterns: ["https://github.com/*/*/pull/*"],
  });
});

function startReview(tab) {
  const prDetails = getPRDetails(tab.url);
  if (tab.id && prDetails) {
    chrome.tabs.sendMessage(tab.id, { action: "RUN_REVIEW" });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "review-pr") startReview(tab);
});
chrome.action.onClicked.addListener((tab) => startReview(tab));
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "RUN_REVIEW") {
    handleReview()
      .then((suggestions) => sendResponse({ suggestions }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }
  if (msg.action === "trigger_review_from_popup") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) startReview(tabs[0]);
    });
  }
});

export async function handleReview() {
  const diff = await getPageDiff();
  const review = await getReviewForPatch(diff);
  const settings = await loadSettings();
  if (settings.enableAutoComment && Array.isArray(review.comments)) {
    await postReviewComments(review.comments);
  }
  return review.suggestions || [];
}
