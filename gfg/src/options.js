const MSG_TEST = "GFG_SYNC::TEST_CONNECTION";
const MSG_GET_LOG = "GFG_SYNC::GET_LOG";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = cls || "";
}

async function load() {
  const { settings = {} } = await chrome.storage.local.get("settings");
  $("pat").value = settings.pat || "";
  $("owner").value = settings.owner || "Ankita7033";
  $("repo").value = settings.repo || "GFG_solution";
  $("branch").value = settings.branch || "main";
  renderLog();
}

function currentSettings() {
  return {
    pat: $("pat").value.trim(),
    owner: $("owner").value.trim(),
    repo: $("repo").value.trim(),
    branch: $("branch").value.trim() || "main"
  };
}

$("save").addEventListener("click", async () => {
  const settings = currentSettings();
  if (!settings.pat || !settings.owner || !settings.repo) {
    setStatus("PAT, owner and repo are required.", "err");
    return;
  }
  await chrome.storage.local.set({ settings });
  setStatus("Saved.", "ok");
});

$("test").addEventListener("click", async () => {
  const settings = currentSettings();
  if (!settings.pat || !settings.owner || !settings.repo) {
    setStatus("Fill in PAT, owner and repo first.", "err");
    return;
  }
  setStatus("Testing...");
  chrome.runtime.sendMessage({ type: MSG_TEST, settings }, (res) => {
    if (res && res.ok) {
      setStatus(
        `Connected to ${res.fullName}. Write access: ${res.canWrite ? "yes" : "NO — check the token's permissions"}.`,
        res.canWrite ? "ok" : "err"
      );
    } else {
      setStatus(`Failed: ${res ? res.error : "no response"}`, "err");
    }
  });
});

function renderLog() {
  chrome.runtime.sendMessage({ type: MSG_GET_LOG }, (res) => {
    const log = (res && res.log) || [];
    const el = $("log");
    if (!log.length) {
      el.textContent = "Nothing pushed yet.";
      return;
    }
    el.innerHTML = log
      .map((e) => {
        const when = new Date(e.at).toLocaleString();
        if (e.ok) {
          return `<div>✅ ${when} — ${e.title || ""} → ${e.path}${e.skipped ? " (unchanged, skipped)" : ""}</div>`;
        }
        return `<div>❌ ${when} — ${e.title || ""}: ${e.error}</div>`;
      })
      .join("");
  });
}

load();
