"use strict";

const $ = (id) => document.getElementById(id);
const statusEl = $("status");

function setStatus(text, cls) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (cls ? " " + cls : "");
}

async function load() {
  const { config } = await chrome.storage.local.get("config");
  const c = config || {};
  $("owner").value = c.owner || "";
  $("repo").value = c.repo || "codechef_solution";
  $("branch").value = c.branch || "main";
  $("token").value = c.token || "";
  $("autoCommit").checked = c.autoCommit !== false;
}

function readForm() {
  return {
    owner: $("owner").value.trim(),
    repo: ($("repo").value.trim() || "codechef_solution"),
    branch: ($("branch").value.trim() || "main"),
    token: $("token").value.trim(),
    autoCommit: $("autoCommit").checked,
  };
}

async function save() {
  const config = readForm();
  await chrome.storage.local.set({ config });
  setStatus("Saved.", "ok");
}

$("save").addEventListener("click", save);

$("test").addEventListener("click", async () => {
  await save();
  setStatus("Testing connection…");
  chrome.runtime.sendMessage({ type: "testConnection" }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (resp && resp.ok) {
      setStatus(
        `Connected as ${resp.login}\nRepo: ${resp.repoFullName} (${resp.private ? "private" : "public"})\nDefault branch: ${resp.defaultBranch}`,
        "ok"
      );
    } else {
      setStatus((resp && resp.error) || "Connection failed.", "err");
    }
  });
});

$("commitLast").addEventListener("click", async () => {
  await save();
  const { lastSubmission } = await chrome.storage.local.get("lastSubmission");
  if (!lastSubmission || !lastSubmission.source) {
    setStatus("No captured solution yet. Submit a problem on CodeChef first.", "err");
    return;
  }
  setStatus(`Committing ${lastSubmission.problemCode || "solution"}…`);
  chrome.runtime.sendMessage({ type: "commitManual", submission: lastSubmission }, (resp) => {
    if (chrome.runtime.lastError) {
      setStatus(chrome.runtime.lastError.message, "err");
      return;
    }
    if (resp && resp.ok) {
      setStatus(`Committed → ${resp.path}`, "ok");
    } else {
      setStatus((resp && resp.error) || "Commit failed.", "err");
    }
  });
});

load();
