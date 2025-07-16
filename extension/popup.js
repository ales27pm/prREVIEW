// extension/popup.js
document.getElementById("open-settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// The "Run Review" button in the popup is now a fallback.
document.getElementById("run-review").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "trigger_review_from_popup" });
  window.close();
});
