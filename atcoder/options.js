const $ = (id) => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get({
    token: "",
    username: "",
    repo: "atcoder_solution",
    branch: "main",
  });
  $("username").value = s.username;
  $("repo").value = s.repo;
  $("branch").value = s.branch;
  $("token").value = s.token;
}

function setStatus(msg, cls) {
  const el = $("status");
  el.textContent = msg;
  el.className = cls || "";
}

$("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    username: $("username").value.trim(),
    repo: $("repo").value.trim() || "atcoder_solution",
    branch: $("branch").value.trim() || "main",
    token: $("token").value.trim(),
  });
  setStatus("Saved ✓", "ok");
});

$("test").addEventListener("click", () => {
  setStatus("Testing…");
  chrome.runtime.sendMessage({ type: "TEST_CONNECTION" }, (res) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (res && res.ok) {
      let msg = `Connected to ${res.repo}\nDefault branch: ${res.default_branch}`;
      if (res.permissions && !res.permissions.push) {
        msg += "\n⚠ Token has no push permission — check Contents: Read and write.";
        setStatus(msg, "err");
      } else if (!res.branchOk) {
        msg += `\n⚠ Your configured branch differs from the default. Pushes will target "${$("branch").value.trim()}".`;
        setStatus(msg, "ok");
      } else {
        setStatus(msg + "\nReady ✓", "ok");
      }
    } else {
      setStatus("Failed: " + (res ? res.error : "unknown error"), "err");
    }
  });
});

load();
