let statusIndicator;

function injectStyle() {
  if (document.getElementById("ai-review-style")) return;
  const link = document.createElement("link");
  link.id = "ai-review-style";
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("status.css");
  document.head.appendChild(link);
}

export function createStatusIndicator() {
  if (document.getElementById("ai-review-status-indicator")) return;
  injectStyle();

  statusIndicator = document.createElement("div");
  statusIndicator.id = "ai-review-status-indicator";
  statusIndicator.innerHTML = `
    <div class="spinner"></div>
    <p id="ai-review-status-text">Initializing...</p>
    <button id="ai-review-close-btn">×</button>
  `;
  document.body.appendChild(statusIndicator);

  document.getElementById("ai-review-close-btn").onclick = () => {
    statusIndicator.remove();
    statusIndicator = null;
  };
}

export function updateStatus(message, isError = false, isComplete = false) {
  if (!statusIndicator) createStatusIndicator();
  const statusText = document.getElementById("ai-review-status-text");
  const spinner = statusIndicator?.querySelector(".spinner");

  if (statusText) {
    statusText.textContent = message;
  }

  if (isError || isComplete) {
    if (spinner) spinner.style.display = "none";
  } else {
    if (spinner) spinner.style.display = "block";
  }
}

export function removeStatusIndicator() {
  if (statusIndicator) {
    statusIndicator.remove();
    statusIndicator = null;
  }
}
