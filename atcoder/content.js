// Isolated content-script world. Two jobs:
//   1. When the interceptor reports a final AC (from the status poll on the
//      submissions page), fetch that submission's detail page to get the source
//      code + task + language, then hand it to the background worker to commit.
//   2. If the user is looking directly at a submission detail page that is AC,
//      parse the page in place and commit it (manual re-push / fallback path).

const LANG_EXT = {
  "c++": "cpp", cpp: "cpp", "g++": "cpp", "c++17": "cpp", "c++14": "cpp",
  "c++20": "cpp", "c++23": "cpp",
  c: "c", gcc: "c",
  python: "py", python3: "py", py: "py", pypy: "py", pypy3: "py", cpython: "py",
  java: "java",
  javascript: "js", "node.js": "js", nodejs: "js", js: "js", deno: "ts",
  typescript: "ts",
  kotlin: "kt",
  go: "go", golang: "go",
  rust: "rs",
  ruby: "rb",
  "c#": "cs", csharp: "cs",
  php: "php",
  swift: "swift",
  scala: "scala",
  haskell: "hs",
  "d ": "d",
  perl: "pl",
  lua: "lua",
  fortran: "f90",
  bash: "sh", sh: "sh",
  text: "txt",
};

function extFor(language) {
  if (!language) return "txt";
  const key = String(language).toLowerCase().trim();
  if (LANG_EXT[key]) return LANG_EXT[key];
  // AtCoder language strings carry a version, e.g. "C++ 17 (GCC 8.2.0)",
  // "Python (CPython 3.11.4)", "PyPy3 (7.3.0)", "JavaScript (Node.js 18.16.1)".
  if (key.includes("pypy") || key.includes("python") || key.includes("cpython")) return "py";
  if (key.includes("c++") || key.includes("g++")) return "cpp";
  if (key.includes("kotlin")) return "kt";
  if (key.includes("java") && !key.includes("javascript")) return "java";
  if (key.includes("javascript") || key.includes("node")) return "js";
  if (key.includes("typescript") || key.includes("deno")) return "ts";
  if (key.includes("c#") || key.includes("mono") || key.includes(".net")) return "cs";
  if (key.includes("rust")) return "rs";
  if (key.includes("golang") || key.startsWith("go ") || key === "go") return "go";
  if (key.includes("ruby")) return "rb";
  if (key.includes("haskell")) return "hs";
  if (key.includes("scala")) return "scala";
  if (key.includes("swift")) return "swift";
  if (key.includes("php")) return "php";
  if (key.includes("bash") || key.includes("shell")) return "sh";
  for (const name of Object.keys(LANG_EXT)) {
    if (key.startsWith(name)) return LANG_EXT[name];
  }
  // Plain C must be checked after C++/C# so it doesn't swallow them.
  if (/^c\b/.test(key) || key.startsWith("gcc") || key.startsWith("clang")) return "c";
  return "txt";
}

// Parse a submission detail Document (from a fetch or the live page) into a
// push payload. Returns null if it isn't a usable AC submission.
function parseSubmissionDoc(doc, sid, contestCode) {
  const source =
    doc.querySelector("#submission-code")?.textContent ??
    doc.querySelector("pre.prettyprint, pre code")?.textContent ??
    null;
  if (!source) return null;

  // The detail page has a two-column info table (Submission Time, Task, User,
  // Language, Score, Code Size, Status, Exec Time, Memory). Map by row label.
  const info = {};
  doc.querySelectorAll("table tr").forEach((tr) => {
    const cells = tr.querySelectorAll("th, td");
    if (cells.length >= 2) {
      const key = cells[0].textContent.trim().toLowerCase();
      if (key && !(key in info)) info[key] = cells[1];
    }
  });

  const status = (info["status"]?.textContent || "").trim().toUpperCase();
  // Only push clean full-AC submissions.
  if (status && !/^AC\b/.test(status)) return null;

  // Task: link to /contests/<c>/tasks/<taskId>, text like "A - Two Cards".
  let taskId = null, taskIndex = null, taskTitle = null, contest = contestCode;
  const taskLink =
    (info["task"] && info["task"].querySelector('a[href*="/tasks/"]')) ||
    doc.querySelector('a[href*="/tasks/"]');
  if (taskLink) {
    const m = taskLink.getAttribute("href").match(/\/contests\/([^/]+)\/tasks\/([^/?#]+)/);
    if (m) {
      contest = contest || m[1];
      taskId = m[2];
    }
    const txt = taskLink.textContent.trim();
    const tm = txt.match(/^([A-Za-z0-9]+)\s*[-–—]\s*(.+)$/);
    if (tm) { taskIndex = tm[1]; taskTitle = tm[2]; }
    else taskTitle = txt;
  }

  const language = (info["language"]?.textContent || "").trim() || null;

  if (!taskId) return null; // can't lay out the file without a task id

  return {
    sid: String(sid),
    contestCode: contest || "unknown_contest",
    taskId,
    taskIndex,
    taskTitle,
    source,
    language: language || "txt",
    ext: extFor(language),
    verdict: status || "AC",
    url: `https://atcoder.jp/contests/${contest}/submissions/${sid}`,
    ts: Date.now(),
  };
}

function sendPayload(payload) {
  chrome.runtime.sendMessage({ type: "PUSH_SOLUTION", payload }, (res) => {
    if (chrome.runtime.lastError) {
      console.error("[AC→GH]", chrome.runtime.lastError.message);
    } else {
      console.log("[AC→GH] background result:", res);
    }
  });
}

// Avoid re-fetching/re-pushing the same submission repeatedly within a session.
const handledSids = new Set();

async function handleAcceptedSubmission(sid, contestCode) {
  if (!sid || handledSids.has(sid)) return;
  handledSids.add(sid);
  try {
    const url = `https://atcoder.jp/contests/${contestCode}/submissions/${sid}`;
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`detail page ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const payload = parseSubmissionDoc(doc, sid, contestCode);
    if (!payload) {
      console.warn("[AC→GH] could not parse submission", sid);
      handledSids.delete(sid); // allow a retry later
      return;
    }
    sendPayload(payload);
  } catch (e) {
    console.warn("[AC→GH] fetch/parse failed for", sid, e.message);
    handledSids.delete(sid);
  }
}

// (1) From the interceptor's status-poll detection.
window.addEventListener("AC_GH_ACCEPTED", (ev) => {
  const d = ev.detail || {};
  handleAcceptedSubmission(d.sid, d.contestCode);
});

// (2) Direct visit to a submission detail page: parse the live DOM.
(function handleDirectDetailPage() {
  const m = location.pathname.match(/\/contests\/([^/]+)\/submissions\/(\d+)\b/);
  if (!m) return;
  const contestCode = m[1];
  const sid = m[2];
  if (handledSids.has(sid)) return;
  const payload = parseSubmissionDoc(document, sid, contestCode);
  if (payload) {
    handledSids.add(sid);
    sendPayload(payload);
  }
})();

console.log("[AC→GH] content bridge active");
