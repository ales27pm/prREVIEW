document.getElementById("saveToken").addEventListener("click", () => {
  const token = document.getElementById("githubToken").value;
  chrome.storage.sync.set({ githubToken: token }, () => {
    alert("GitHub token saved!");
  });
});

document.getElementById("saveOpenAI").addEventListener("click", () => {
  const key = document.getElementById("openaiKey").value;
  chrome.storage.sync.set({ openaiKey: key }, () => {
    alert("OpenAI key saved!");
  });
});
