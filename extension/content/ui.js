// extension/content/ui.js

/**
 * Injects a "Review with AI" button into the GitHub PR page.
 */
export function injectReviewButton() {
  const btn = document.createElement("button");
  btn.id = "ai-review-btn";
  btn.textContent = "Review with AI";
  btn.style = `
    margin-left: 8px;
    padding: 4px 8px;
    background: #2ea44f;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  `;
  const headerActions = document.querySelector(".gh-header-actions");
  headerActions && headerActions.prepend(btn);
  return btn;
}

/**
 * Shows a loading spinner next to the button.
 */
export function showLoading() {
  let spinner = document.getElementById("ai-review-spinner");
  if (!spinner) {
    spinner = document.createElement("span");
    spinner.id = "ai-review-spinner";
    spinner.textContent = "⏳";
    spinner.style.marginLeft = "8px";
    document.getElementById("ai-review-btn")?.after(spinner);
  }
}

/**
 * Removes the loading spinner.
 */
export function hideLoading() {
  document.getElementById("ai-review-spinner")?.remove();
}

/**
 * Renders the AI suggestions panel under the PR description.
 */
export function showSuggestions(suggestions) {
  hideLoading();
  let panel = document.getElementById("ai-suggestions-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ai-suggestions-panel";
    panel.style = `
      border: 1px solid #e1e4e8;
      padding: 16px;
      margin-top: 16px;
      background: #f6f8fa;
    `;
    const discussion = document.querySelector(".discussion-timeline-actions");
    discussion && discussion.before(panel);
  }
  panel.textContent = "";
  const header = document.createElement("h3");
  header.textContent = "AI Review Suggestions";
  panel.appendChild(header);
  suggestions.forEach((s) => {
    const p = document.createElement("p");
    p.textContent = `• ${s}`;
    panel.appendChild(p);
  });
}

/**
 * Shows an error message.
 */
export function showError(err) {
  hideLoading();
  alert("AI Review failed: " + err);
}
