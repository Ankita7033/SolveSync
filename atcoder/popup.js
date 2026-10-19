chrome.storage.sync.get({ token: "", username: "", repo: "atcoder_solution" }).then((s) => {
  const el = document.getElementById("state");
  if (s.token && s.username) {
    el.textContent = `Ready → ${s.username}/${s.repo}`;
    el.className = "ok";
  } else {
    el.textContent = "Not configured — open settings to add your token.";
    el.className = "warn";
  }
});

document.getElementById("open").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
