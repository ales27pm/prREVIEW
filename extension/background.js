// extension/background.js
import { extractPRDetails } from "./utils.js";

// Create a context menu item for GitHub PR pages.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "review-pr",
    title: "Run AI Review on this PR",
    contexts: ["page"],
    documentUrlPatterns: ["https://github.com/*/*/pull/*"],
  });
});

/**
 * Initiates the AI review process on a GitHub pull request page by sending a message to the content script in the specified tab.
 * 
 * If the provided tab corresponds to a valid GitHub PR page, a message with PR details is sent to trigger the review. Logs a message if the tab is not a valid PR page or if message delivery fails.
 */
function startReview(tab) {
  const prDetails = extractPRDetails(tab.url);
  if (tab.id && prDetails) {
    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "run_review",
        prDetails: prDetails,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Failed to send message:",
            chrome.runtime.lastError.message
          );
        }
      }
    );
  } else {
    console.log("Not a valid PR page.");
  }
}

// Listen for clicks on the context menu.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "review-pr") {
    startReview(tab);
  }
});

// Listen for clicks on the extension's action icon (toolbar button).
chrome.action.onClicked.addListener((tab) => {
  startReview(tab);
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "trigger_review_from_popup") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startReview(tabs[0]);
      }
    });
  }
});
