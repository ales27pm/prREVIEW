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

/**
 * Updates the status indicator's message and spinner visibility.
 *
 * If the status indicator does not exist, it is created. The displayed message is updated, and the spinner is shown or hidden based on whether the operation is complete or an error has occurred.
 *
 * @param {string} message - The status message to display.
 * @param {boolean} [isError=false] - Whether the status represents an error.
 * @param {boolean} [isComplete=false] - Whether the operation is complete.
 */
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
