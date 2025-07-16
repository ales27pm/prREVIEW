document.getElementById("saveToken").addEventListener("click", () => {
  const token = document.getElementById("githubToken").value;
  chrome.storage.local.set({ githubToken: token }, () => {
    alert("GitHub token saved!");
  });
});
