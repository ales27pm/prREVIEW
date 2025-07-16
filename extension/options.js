// extension/options.js

const saveButton = document.getElementById("save-settings");
const githubTokenInput = document.getElementById("githubToken");
const openAIApiKeyInput = document.getElementById("openAIApiKey");
const githubStatus = document.getElementById("github-status");
const openaiStatus = document.getElementById("openai-status");

// Load saved settings when the page opens
document.addEventListener("DOMContentLoaded", async () => {
  const { githubToken, openAIApiKey } = await chrome.storage.local.get([
    "githubToken",
    "openAIApiKey",
  ]);
  if (githubToken) {
    githubTokenInput.value = githubToken;
  }
  if (openAIApiKey) {
    openAIApiKeyInput.value = openAIApiKey;
  }
});

const openaiStatus = document.getElementById("openai-status");

let githubStatusTimeout;
let openaiStatusTimeout;

saveButton.addEventListener("click", () => {
  const githubToken = githubTokenInput.value;
  const openAIApiKey = openAIApiKeyInput.value;

  if (!githubToken) {
    githubStatus.textContent = "GitHub Token is required.";
    githubStatus.className = "status error";
    return;
  }

  if (!openAIApiKey) {
    openaiStatus.textContent = "OpenAI API Key is required.";
    openaiStatus.className = "status error";
    return;
  }

  chrome.storage.local.set({ githubToken, openAIApiKey }, () => {
    // Clear any existing timeouts
    clearTimeout(githubStatusTimeout);
    clearTimeout(openaiStatusTimeout);
    
    githubStatus.textContent = "GitHub Token Saved!";
    githubStatus.className = "status success";
    openaiStatus.textContent = "OpenAI Key Saved!";
    openaiStatus.className = "status success";

    githubStatusTimeout = setTimeout(() => {
      githubStatus.textContent = "";
    }, 3000);
    openaiStatusTimeout = setTimeout(() => {
      openaiStatus.textContent = "";
    }, 3000);
  });
});
