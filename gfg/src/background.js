const MSG_SOLVED = "GFG_SYNC::SOLVED";
const MSG_TEST = "GFG_SYNC::TEST_CONNECTION";
const MSG_GET_LOG = "GFG_SYNC::GET_LOG";

const EXT_BY_LANGUAGE = [
  [/c\+\+/i, "cpp"],
  [/c\s*\(/i, "c"],
  [/java(?!script)/i, "java"],
  [/python/i, "py"],
  [/javascript|node/i, "js"],
  [/typescript/i, "ts"],
  [/c#/i, "cs"],
  [/kotlin/i, "kt"],
  [/ruby/i, "rb"],
  [/swift/i, "swift"],
  [/scala/i, "scala"],
  [/php/i, "php"],
  [/perl/i, "pl"],
  [/rust/i, "rs"],
  [/\bgo\b/i, "go"]
];

function extFor(language) {
  if (!language) return "txt";
  for (const [re, ext] of EXT_BY_LANGUAGE) {
    if (re.test(language)) return ext;
  }
  return "txt";
}

function slugify(str) {
  return (str || "problem")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "problem";
}

// btoa() only handles Latin1; this encodes arbitrary UTF-8 source code safely.
function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return settings || {};
}

async function appendLog(entry) {
  const { log = [] } = await chrome.storage.local.get("log");
  log.unshift({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ log: log.slice(0, 50) });
}

async function githubRequest(settings, path, options = {}) {
  const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  return res;
}

async function pushSolution(payload) {
  const settings = await getSettings();
  if (!settings.pat || !settings.owner || !settings.repo) {
    throw new Error("Extension not configured yet — open the options page and set your GitHub PAT, owner and repo.");
  }
  const branch = settings.branch || "main";
  const ext = extFor(payload.language);
  const folder = payload.difficulty ? slugify(payload.difficulty) : "misc";
  const path = `${folder}/${slugify(payload.slug)}.${ext}`;
  const encodedContent = utf8ToBase64(payload.code);

  // Look up existing file sha (required by the Contents API to update a file).
  let sha;
  const getRes = await githubRequest(settings, `${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`);
  if (getRes.status === 200) {
    const existing = await getRes.json();
    if (existing.content && existing.content.replace(/\n/g, "") === encodedContent) {
      return { ok: true, skipped: true, path };
    }
    sha = existing.sha;
  } else if (getRes.status !== 404) {
    const body = await getRes.text();
    throw new Error(`GitHub GET failed (${getRes.status}): ${body}`);
  }

  const putRes = await githubRequest(settings, encodeURIComponent(path), {
    method: "PUT",
    body: JSON.stringify({
      message: `GFG: ${payload.title} (${payload.language || "unknown language"})`,
      content: encodedContent,
      branch,
      ...(sha ? { sha } : {})
    })
  });

  if (!putRes.ok) {
    const body = await putRes.text();
    throw new Error(`GitHub PUT failed (${putRes.status}): ${body}`);
  }

  return { ok: true, skipped: false, path };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MSG_SOLVED) {
    pushSolution(message.payload)
      .then((result) => {
        appendLog({ title: message.payload.title, path: result.path, skipped: result.skipped, ok: true });
        chrome.action.setBadgeText({ text: result.skipped ? "=" : "OK" });
        chrome.action.setBadgeBackgroundColor({ color: result.skipped ? "#888888" : "#2ea44f" });
        sendResponse({ ok: true, path: result.path, skipped: result.skipped });
      })
      .catch((err) => {
        appendLog({ title: message.payload?.title, error: err.message, ok: false });
        chrome.action.setBadgeText({ text: "ERR" });
        chrome.action.setBadgeBackgroundColor({ color: "#cf222e" });
        sendResponse({ ok: false, error: err.message });
      });
    return true; // keep the message channel open for the async response
  }

  if (message?.type === MSG_TEST) {
    (async () => {
      try {
        const settings = message.settings;
        const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}`, {
          headers: {
            Authorization: `Bearer ${settings.pat}`,
            Accept: "application/vnd.github+json"
          }
        });
        if (!res.ok) {
          const body = await res.text();
          sendResponse({ ok: false, error: `${res.status}: ${body}` });
          return;
        }
        const json = await res.json();
        const canWrite = !!(json.permissions && (json.permissions.push || json.permissions.admin));
        sendResponse({ ok: true, canWrite, fullName: json.full_name });
      } catch (e) {
        sendResponse({ ok: false, error: e.message });
      }
    })();
    return true;
  }

  if (message?.type === MSG_GET_LOG) {
    chrome.storage.local.get("log").then(({ log = [] }) => sendResponse({ ok: true, log }));
    return true;
  }
});
