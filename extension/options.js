// extension/options.js

import {
  loadSettings as getStoredSettings,
  saveSettings as persistSettings,
} from "./settings.js";

const saveButton = document.getElementById("save-settings");
const githubTokenInput = document.getElementById("githubToken");
const openAIApiKeyInput = document.getElementById("openAIApiKey");
const openAIModelInput = document.getElementById("openAIModel");
const maxTokensInput = document.getElementById("maxTokens");
const temperatureInput = document.getElementById("temperature");
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
 * Loads saved GitHub and OpenAI API credentials from browser storage and populates the input fields.
 * Displays an error status message if loading fails.
 */
async function displaySettings() {
  try {
    const settings = await getStoredSettings();
    if (settings.githubToken) {
      githubTokenInput.value = settings.githubToken;
    }
    if (settings.openAIApiKey) {
      openAIApiKeyInput.value = settings.openAIApiKey;
    }
    if (settings.openAIModel) {
      openAIModelInput.value = settings.openAIModel;
    }
    if (settings.maxTokens) {
      maxTokensInput.value = settings.maxTokens;
    }
    if (settings.temperature !== undefined) {
      temperatureInput.value = settings.temperature;
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
    showStatus("Error loading settings.", "error");
  }
}

/**
 * Saves the GitHub token and OpenAI API key from input fields to browser storage.
 * Displays a status message indicating success or failure. If either input is empty, shows an error and does not save.
 */
async function saveFormSettings() {
  const githubToken = githubTokenInput.value.trim();
  const openAIApiKey = openAIApiKeyInput.value.trim();
  const openAIModel = openAIModelInput.value.trim();
  const maxTokens = parseInt(maxTokensInput.value, 10);
  const temperature = parseFloat(temperatureInput.value);

  if (!githubToken || !openAIApiKey) {
    showStatus("Both GitHub Token and OpenAI API Key are required.", "error");
    return;
  }

  try {
    await persistSettings({
      githubToken,
      openAIApiKey,
      openAIModel,
      maxTokens,
      temperature,
    });
    showStatus("Settings saved successfully!");
  } catch (error) {
    console.error("Failed to save settings:", error);
    showStatus("Error saving settings. Please try again.", "error");
  }
}

document.addEventListener("DOMContentLoaded", displaySettings);
saveButton.addEventListener("click", saveFormSettings);
