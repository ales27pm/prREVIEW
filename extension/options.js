// extension/options.js

const saveButton = document.getElementById("save-settings");
const githubTokenInput = document.getElementById("githubToken");
const openAIApiKeyInput = document.getElementById("openAIApiKey");
const statusElement = document.getElementById("form-status");

let statusTimeout;

/**
 * Displays a temporary status message with a specified type on the options page.
 *
 * @param {string} message - The message to display.
 * @param {string} [type="success"] - The type of status message ("success" or "error"), which determines the CSS class.
 */
function showStatus(message, type = "success") {
  clearTimeout(statusTimeout);
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  statusTimeout = setTimeout(() => {
    statusElement.textContent = "";
    statusElement.className = "status";
  }, 4000);
}

/**
 * Loads GitHub and OpenAI API credentials from synchronized browser storage and fills the corresponding input fields.
 * Shows an error status message if retrieval fails.
 */
async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get();
    if (settings.githubToken) {
      githubTokenInput.value = settings.githubToken;
    }
    if (settings.openAIApiKey) {
      openAIApiKeyInput.value = settings.openAIApiKey;
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
    showStatus("Error loading settings.", "error");
  }
}

/**
 * Saves the GitHub token and OpenAI API key from input fields to synchronized browser storage.
 * Shows a status message indicating whether the save was successful or if required fields are missing.
 */
async function saveSettings() {
  const githubToken = githubTokenInput.value.trim();
  const openAIApiKey = openAIApiKeyInput.value.trim();

  if (!githubToken || !openAIApiKey) {
    showStatus("Both GitHub Token and OpenAI API Key are required.", "error");
    return;
  }

  try {
    await chrome.storage.sync.set({ githubToken, openAIApiKey });
    showStatus("Settings saved successfully!");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showStatus("Error saving settings. Please try again.", "error");
  }
}

document.addEventListener("DOMContentLoaded", loadSettings);
saveButton.addEventListener("click", saveSettings);
