// extension/popup.js
document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// The "Run Review" button in the popup is now a fallback.
document.getElementById("run-review").addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { action: "trigger_review_from_popup" },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to trigger review:", chrome.runtime.lastError.message);
      }
      window.close();
    }
  );
});

// In background.js, you'd add this listener:
/*
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "trigger_review_from_popup") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        startReview(tabs[0]);
      }
    });
  }
});
*/
