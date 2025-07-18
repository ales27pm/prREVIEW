// extension/content/content.js
import {
  injectReviewButton,
  showLoading,
  showSuggestions,
  showError,
} from "./ui.js";

async function runReview() {
  showLoading();
  chrome.runtime.sendMessage({ action: "RUN_REVIEW" }, (response) => {
    if (response.error) return showError(response.error);
    showSuggestions(response.suggestions);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = injectReviewButton();
  btn.addEventListener("click", runReview);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "RUN_REVIEW") {
    runReview();
  }
});
