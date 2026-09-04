/*
 * background.js  —  MV3 service worker. Talks to the GitHub REST API and
 * commits captured solutions to the user's repository.
 */
"use strict";

const GITHUB_API = "https://api.github.com";

// ---- config -------------------------------------------------------------

async function getConfig() {
  const { config } = await chrome.storage.local.get("config");
  return Object.assign(
    {
      token: "",
      owner: "",
      repo: "codechef_solution",
      branch: "main",
      autoCommit: true,
    },
    config || {}
  );
}

// ---- language → file extension -----------------------------------------

function extensionFor(language) {
  const l = String(language || "").toLowerCase();
  const table = [
    [/c\+\+|cpp|g\+\+|gnu.*c\+\+/, "cpp"],
    [/python|pypy|py\b|py3/, "py"],
    [/java(?!script)/, "java"],
    [/javascript|node|js\b/, "js"],
    [/typescript|ts\b/, "ts"],
    [/kotlin/, "kt"],
    [/\bgo\b|golang/, "go"],
    [/rust/, "rs"],
    [/c#|csharp|\.net/, "cs"],
    [/php/, "php"],
    [/ruby/, "rb"],
    [/swift/, "swift"],
    [/scala/, "scala"],
    [/haskell/, "hs"],
    [/perl/, "pl"],
    [/\bc\b|gcc|clang/, "c"],
  ];
  for (const [re, ext] of table) if (re.test(l)) return ext;
  return "txt";
}

// ---- base64 (unicode-safe) ---------------------------------------------

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// ---- GitHub helpers -----------------------------------------------------

async function gh(path, opts, token) {
  const res = await fetch(GITHUB_API + path, {
    ...opts,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(opts && opts.headers),
    },
  });
  return res;
}

async function getExistingSha(cfg, path) {
  const res = await gh(
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}?ref=${encodeURIComponent(cfg.branch)}`,
    { method: "GET" },
    cfg.token
  );
  if (res.status === 200) {
    const j = await res.json();
    return j.sha || null;
  }
  return null; // 404 = file doesn't exist yet
}

async function putFile(cfg, path, content, message) {
  const sha = await getExistingSha(cfg, path);
  const body = {
    message,
    content: toBase64(content),
    branch: cfg.branch,
  };
  if (sha) body.sha = sha;

  const res = await gh(
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`,
    { method: "PUT", body: JSON.stringify(body) },
    cfg.token
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.json();
}

// ---- core commit --------------------------------------------------------

async function commitSolution(sub) {
  const cfg = await getConfig();
  if (!cfg.token) throw new Error("No GitHub token configured. Open the extension popup.");
  if (!cfg.owner) throw new Error("No GitHub username configured. Open the extension popup.");
  if (!sub || !sub.source) throw new Error("No source code captured for this submission.");

  const problem = (sub.problemCode || "UNKNOWN").toUpperCase();
  const ext = extensionFor(sub.language);
  const path = `${problem}/${problem}.${ext}`;

  const header = buildHeader(problem, sub);
  const content = header + sub.source + (sub.source.endsWith("\n") ? "" : "\n");
  const message = `Add accepted solution: ${problem}`;

  const result = await putFile(cfg, path, content, message);
  return { path, htmlUrl: (result.content && result.content.html_url) || "", problem };
}

function buildHeader(problem, sub) {
  const url = sub.contestCode
    ? `https://www.codechef.com/${sub.contestCode}/problems/${problem}`
    : `https://www.codechef.com/problems/${problem}`;
  const comment = commentSyntax(sub.language);
  const lines = [
    `Problem: ${problem}`,
    `URL: ${url}`,
    `Language: ${sub.language || "unknown"}`,
    `Solved on: ${new Date().toISOString().slice(0, 10)}`,
    `Auto-committed by CodeChef → GitHub Sync`,
  ];
  if (comment.block) {
    return `/*\n` + lines.map((l) => " * " + l).join("\n") + `\n */\n\n`;
  }
  return lines.map((l) => comment.line + " " + l).join("\n") + "\n\n";
}

function commentSyntax(language) {
  const l = String(language || "").toLowerCase();
  if (/python|py|ruby|perl|bash|shell/.test(l)) return { line: "#", block: false };
  // C-family and most others support block comments
  return { line: "//", block: true };
}

// ---- messaging ----------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && (msg.type === "commit" || msg.type === "commitManual")) {
    (async () => {
      try {
        const sub =
          msg.submission ||
          (await chrome.storage.local.get("lastSubmission")).lastSubmission;
        const r = await commitSolution(sub);
        await recordSolved(r.problem, r.path);
        notify("✅ Committed to GitHub", `${r.problem} → ${r.path}`);
        sendResponse({ ok: true, ...r });
      } catch (e) {
        notify("❌ GitHub sync failed", String(e.message || e));
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true; // async response
  }

  if (msg && msg.type === "testConnection") {
    (async () => {
      try {
        const r = await testConnection();
        sendResponse({ ok: true, ...r });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }
});

async function recordSolved(problem, path) {
  const { solved } = await chrome.storage.local.get("solved");
  const list = solved || {};
  list[problem] = { path, at: Date.now() };
  await chrome.storage.local.set({ solved: list });
}

async function testConnection() {
  const cfg = await getConfig();
  if (!cfg.token) throw new Error("Enter a GitHub token first.");
  if (!cfg.owner) throw new Error("Enter your GitHub username first.");

  // Verify token identity
  const me = await gh("/user", { method: "GET" }, cfg.token);
  if (!me.ok) throw new Error(`Token check failed (${me.status}). Is the token valid?`);
  const user = await me.json();

  // Verify repo access
  const repo = await gh(`/repos/${cfg.owner}/${cfg.repo}`, { method: "GET" }, cfg.token);
  if (repo.status === 404) {
    throw new Error(
      `Repo ${cfg.owner}/${cfg.repo} not found or token lacks access. Create it on GitHub (private is fine) and give the token Contents: Read and write on it.`
    );
  }
  if (!repo.ok) throw new Error(`Repo check failed (${repo.status}).`);
  const repoJson = await repo.json();

  return {
    login: user.login,
    repoFullName: repoJson.full_name,
    defaultBranch: repoJson.default_branch,
    private: repoJson.private,
  };
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: "basic",
      iconUrl:
        "data:image/svg+xml;base64," +
        btoa(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#5b4636"/><text x="32" y="42" font-size="34" text-anchor="middle" fill="#fff">CC</text></svg>'
        ),
      title,
      message,
    });
  } catch (_) {
    // notifications permission may be missing; ignore
    console.log("[CC→GH]", title, message);
  }
}
