document.getElementById("saveToken").addEventListener("click", async () => {
  const token = document.getElementById("githubToken").value;
  if (!token || !token.trim()) {
    showMessage("Please enter a valid GitHub token", "error");
    return;
  }
  try {
    await chrome.storage.local.set({ githubToken: token });
    showMessage("GitHub token saved successfully!", "success");
  } catch (error) {
    console.error("Failed to save GitHub token:", error);
    showMessage("Failed to save token. Please try again.", "error");
  }
});

document.getElementById("saveOpenAI").addEventListener("click", async () => {
  const key = document.getElementById("openaiKey").value;
  if (!key || !key.trim()) {
    showMessage("Please enter a valid OpenAI API key", "error");
    return;
  }
  try {
    await chrome.storage.local.set({ openaiKey: key });
    showMessage("OpenAI key saved successfully!", "success");
  } catch (error) {
    console.error("Failed to save OpenAI key:", error);
    showMessage("Failed to save key. Please try again.", "error");
  }
});

function showMessage(message, type) {
  // Implement a non-blocking UI notification instead of alert()
  const messageEl = document.getElementById("message");
  if (messageEl) {
    messageEl.textContent = message;
    messageEl.className = `message ${type}`;
    setTimeout(() => {
      messageEl.textContent = "";
      messageEl.className = "message";
    }, 3000);
  }
}
