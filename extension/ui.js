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
 * Updates the status indicator with a new message and adjusts spinner visibility.
 *
 * Creates the status indicator if it does not exist, sets the displayed message, and shows or hides the spinner based on error or completion state. If an error or completion is indicated, the status indicator is automatically removed after 5 seconds.
 *
 * @param {string} message - The message to display in the status indicator.
 * @param {Object} [options] - Options to control indicator state.
 * @param {boolean} [options.isError=false] - Set to true if the status represents an error.
 * @param {boolean} [options.isComplete=false] - Set to true if the operation is complete.
 */
export function updateStatus(
  message,
  { isError = false, isComplete = false } = {},
) {
  if (!statusIndicator) createStatusIndicator();
  const statusText = document.getElementById("ai-review-status-text");
  const spinner = statusIndicator?.querySelector(".spinner");

  if (statusText) {
    statusText.textContent = message;
  }

  if (spinner) {
    spinner.style.display = isError || isComplete ? "none" : "block";
  }

  statusIndicator.classList.remove("error", "success");
  if (isError) {
    statusIndicator.classList.add("error");
  } else if (isComplete) {
    statusIndicator.classList.add("success");
  }

  if (isError || isComplete) {
    setTimeout(removeStatusIndicator, 5000);
  }
}

export function removeStatusIndicator() {
  if (statusIndicator) {
    statusIndicator.remove();
    statusIndicator = null;
  }
}
