// Service worker: receives Accepted (AC) AtCoder submissions from the content
// script and commits them to the user's GitHub repo via the REST Contents API.

const GH = "https://api.github.com";

async function getSettings() {
  return chrome.storage.sync.get({
    token: "",
    username: "",
    repo: "atcoder_solution",
    branch: "main",
  });
}

// UTF-8 safe base64 (btoa alone breaks on non-Latin1 chars).
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

// Get the sha of an existing file (needed to update) — null if it doesn't exist.
async function getExistingSha(owner, repo, path, branch, token) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)
    .replace(/%2F/g, "/")}?ref=${encodeURIComponent(branch)}`;
  const res = await fetch(url, { headers: ghHeaders(token) });
  if (res.status === 200) {
    const j = await res.json();
    return { sha: j.sha, content: j.content };
  }
  if (res.status === 404) return null;
  throw new Error(`GET ${path} -> ${res.status}: ${await res.text()}`);
}

async function putFile(owner, repo, path, branch, token, contentStr, message, sha) {
  const url = `${GH}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)
    .replace(/%2F/g, "/")}`;
  const body = { message, content: toBase64(contentStr), branch };
  if (sha) body.sha = sha;
  const res = await fetch(url, {
    method: "PUT",
    headers: ghHeaders(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

function slug(s) {
  return String(s || "").replace(/[^A-Za-z0-9_.-]/g, "_");
}

function buildReadme(p) {
  const taskLabel = p.taskIndex
    ? `${p.taskIndex} — ${p.taskTitle || p.taskId}`
    : p.taskTitle || p.taskId;
  return [
    `# ${p.taskId}${p.taskTitle ? " — " + p.taskTitle : ""}`,
    "",
    `- **Contest:** [${p.contestCode}](https://atcoder.jp/contests/${p.contestCode})`,
    `- **Task:** [${taskLabel}](https://atcoder.jp/contests/${p.contestCode}/tasks/${p.taskId})`,
    `- **Language:** ${p.language}`,
    `- **Verdict:** ${p.verdict || "AC"}`,
    `- **Submission:** [#${p.sid}](${p.url})`,
    `- **Solved:** ${new Date(p.ts).toISOString().slice(0, 10)}`,
    "",
    "_Auto-committed by the AtCoder → GitHub Sync extension._",
    "",
  ].join("\n");
}

async function pushSolution(payload) {
  const { token, username, repo, branch } = await getSettings();
  if (!token || !username) {
    throw new Error("Missing GitHub token or username. Open the extension options.");
  }

  // Layout: <contest>/<taskId>/<taskId>.<ext>  (+ README.md)
  // e.g. abc300/abc300_a/abc300_a.cpp
  const dir = `${slug(payload.contestCode)}/${slug(payload.taskId)}`;
  const codePath = `${dir}/${slug(payload.taskId)}.${payload.ext}`;
  const readmePath = `${dir}/README.md`;

  const commitMsg = `Add ${payload.taskId} (${payload.contestCode}) — AC`;

  // Skip if identical content already committed (avoid duplicate no-op commits).
  const existing = await getExistingSha(username, repo, codePath, branch, token);
  let existingDecoded = null;
  if (existing && existing.content) {
    try {
      existingDecoded = new TextDecoder().decode(
        Uint8Array.from(atob(existing.content.replace(/\n/g, "")), (c) => c.charCodeAt(0))
      );
    } catch (_) {}
  }
  if (existingDecoded !== null && existingDecoded === payload.source) {
    return { status: "skipped", reason: "identical solution already present", path: codePath };
  }

  await putFile(
    username, repo, codePath, branch, token,
    payload.source, commitMsg, existing ? existing.sha : undefined
  );

  // README (create/update). Non-fatal if it fails.
  try {
    const exReadme = await getExistingSha(username, repo, readmePath, branch, token);
    await putFile(
      username, repo, readmePath, branch, token,
      buildReadme(payload), `Update README for ${payload.taskId}`,
      exReadme ? exReadme.sha : undefined
    );
  } catch (e) {
    console.warn("[AC→GH] README push failed (non-fatal):", e.message);
  }

  return { status: "pushed", path: codePath };
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message,
    });
  } catch (_) {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "PUSH_SOLUTION") {
    pushSolution(msg.payload)
      .then((res) => {
        if (res.status === "pushed") {
          notify("AtCoder → GitHub", `Pushed ${msg.payload.taskId} ✓`);
        } else if (res.status === "skipped") {
          notify("AtCoder → GitHub", `${msg.payload.taskId}: already up to date`);
        }
        sendResponse(res);
      })
      .catch((err) => {
        console.error("[AC→GH] push failed:", err);
        notify("AtCoder → GitHub — FAILED", err.message.slice(0, 180));
        sendResponse({ status: "error", error: err.message });
      });
    return true; // keep the message channel open for the async response
  }
  if (msg && msg.type === "TEST_CONNECTION") {
    testConnection()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true;
  }
});

// Verify token + repo access from the options page.
async function testConnection() {
  const { token, username, repo, branch } = await getSettings();
  if (!token || !username) return { ok: false, error: "Token/username not set." };
  const res = await fetch(`${GH}/repos/${username}/${repo}`, { headers: ghHeaders(token) });
  if (res.status === 200) {
    const j = await res.json();
    return {
      ok: true,
      repo: j.full_name,
      default_branch: j.default_branch,
      branchOk: j.default_branch === branch,
      permissions: j.permissions,
    };
  }
  return { ok: false, error: `${res.status}: ${await res.text()}` };
}
