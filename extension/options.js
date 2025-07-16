document.getElementById("saveToken").addEventListener("click", () => {
  const token = document.getElementById("githubToken").value;
  if (token) {
    chrome.storage.local.set({ githubToken: token }, () => {
      alert("GitHub token saved!");
    });
  } else {
    alert("Please enter a token.");
  }
});
