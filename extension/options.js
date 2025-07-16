// extension/options.js

const saveButton = document.getElementById("save-settings");
const githubTokenInput = document.getElementById("githubToken");
const openAIApiKeyInput = document.getElementById("openAIApiKey");
const statusElement = document.getElementById("form-status");

let statusTimeout;

function showStatus(message, type = "success") {
  clearTimeout(statusTimeout);
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;
  statusTimeout = setTimeout(() => {
    statusElement.textContent = "";
    statusElement.className = "status";
  }, 4000);
}

async function loadSettings() {
  try {
    const settings = await chrome.storage.local.get();
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

async function saveSettings() {
  const githubToken = githubTokenInput.value.trim();
  const openAIApiKey = openAIApiKeyInput.value.trim();

  if (!githubToken || !openAIApiKey) {
    showStatus("Both GitHub Token and OpenAI API Key are required.", "error");
    return;
  }

  try {
    await chrome.storage.local.set({ githubToken, openAIApiKey });
    showStatus("Settings saved successfully!");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showStatus("Error saving settings. Please try again.", "error");
  }
}

document.addEventListener("DOMContentLoaded", loadSettings);
saveButton.addEventListener("click", saveSettings);
