// Runs in the MAIN world (page context) so it can see window.ace and the
// page's own fetch/XHR traffic. Talks to content.js via window.postMessage
// because MAIN-world scripts cannot call chrome.runtime.sendMessage directly.
(() => {
  const MSG_TAG = "GFG_SYNC::SOLVED";
  const ACCEPT_REGEX = /\bcorrect answer\b|\baccepted\b|\ball test ?cases? passed\b/i;
  const ARM_WINDOW_MS = 45000;

  const LANGUAGE_HINTS = [
    "C++", "C (", "Java", "Python", "JavaScript", "Node.js", "C#",
    "Kotlin", "Ruby", "Swift", "Scala", "PHP", "Perl", "Rust", "Go", "TypeScript"
  ];

  let armed = false;
  let armTimer = null;
  let snapshot = null; // { code, language } captured at Submit time
  let fired = false;

  function log(...args) {
    console.debug("[GFG Sync]", ...args);
  }

  function extractCode() {
    const editors = Array.from(document.querySelectorAll(".ace_editor"));
    if (!editors.length || typeof window.ace === "undefined") return "";
    let best = "";
    for (const el of editors) {
      const container = el.closest("[class*='input'],[class*='output'],[class*='testcase'],[class*='custom']");
      if (container) continue; // skip input/output/testcase panes
      try {
        const value = window.ace.edit(el).getValue();
        if (value && value.length > best.length) best = value;
      } catch (e) {
        /* not a real ace instance on this node */
      }
    }
    if (!best) {
      // fallback: just take the longest ace buffer on the page
      for (const el of editors) {
        try {
          const value = window.ace.edit(el).getValue();
          if (value && value.length > best.length) best = value;
        } catch (e) {}
      }
    }
    return best;
  }

  function extractLanguage() {
    const nodes = document.querySelectorAll("button, div, span");
    for (const node of nodes) {
      const text = (node.textContent || "").trim();
      if (text.length > 0 && text.length <= 30 && LANGUAGE_HINTS.some((h) => text.includes(h))) {
        return text;
      }
    }
    return "";
  }

  function extractProblemMeta() {
    const parts = location.pathname.split("/").filter(Boolean); // ["problems", "<slug>", "1"]
    const slug = parts[1] || "unknown-problem";
    let title = document.title.split("|")[0].trim();
    if (!title) title = slug;
    let difficulty = "";
    const bodyText = document.body.innerText || "";
    const diffMatch = bodyText.match(/Difficulty:\s*(Easy|Medium|Hard)/i);
    if (diffMatch) difficulty = diffMatch[1];
    return { slug, title, difficulty, url: location.href };
  }

  function takeSnapshot() {
    const code = extractCode();
    const language = extractLanguage();
    if (!code) {
      log("Submit clicked but no code could be read from the editor; skipping snapshot.");
      return null;
    }
    return { code, language };
  }

  function disarm() {
    armed = false;
    snapshot = null;
    fired = false;
    if (armTimer) {
      clearTimeout(armTimer);
      armTimer = null;
    }
  }

  function arm() {
    snapshot = takeSnapshot();
    if (!snapshot) return;
    armed = true;
    fired = false;
    log("Armed: watching for verdict for", ARM_WINDOW_MS / 1000, "s");
    if (armTimer) clearTimeout(armTimer);
    armTimer = setTimeout(() => {
      if (armed && !fired) log("Verdict watch window expired without a confirmed Accepted result.");
      disarm();
    }, ARM_WINDOW_MS);
  }

  function fireIfAccepted(sourceLabel) {
    if (!armed || fired || !snapshot) return;
    fired = true;
    const meta = extractProblemMeta();
    const payload = {
      type: MSG_TAG,
      source: sourceLabel,
      ...meta,
      language: snapshot.language,
      code: snapshot.code,
      timestamp: Date.now()
    };
    log("Accepted verdict confirmed via", sourceLabel, "-> forwarding", meta.slug);
    window.postMessage(payload, "*");
    disarm();
  }

  // --- Submit button detection (delegated, survives React re-renders) ---
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if (!btn) return;
      const text = (btn.textContent || "").trim().toLowerCase();
      if (text === "submit") {
        // Let the click's own state updates settle before reading the editor.
        setTimeout(arm, 50);
      }
    },
    true
  );

  // --- DOM-based verdict confirmation ---
  const observer = new MutationObserver(() => {
    if (!armed || fired) return;
    const text = document.body.innerText || "";
    if (ACCEPT_REGEX.test(text)) {
      fireIfAccepted("dom");
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // --- Network-based verdict confirmation (fast path) ---
  const originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = async function (...args) {
      const res = await originalFetch.apply(this, args);
      if (armed && !fired) {
        try {
          const clone = res.clone();
          clone
            .text()
            .then((text) => {
              if (ACCEPT_REGEX.test(text)) fireIfAccepted("fetch");
            })
            .catch(() => {});
        } catch (e) {}
      }
      return res;
    };
  }

  const OriginalXHR = window.XMLHttpRequest;
  if (OriginalXHR) {
    const originalSend = OriginalXHR.prototype.send;
    OriginalXHR.prototype.send = function (...args) {
      this.addEventListener("load", () => {
        if (armed && !fired) {
          try {
            if (ACCEPT_REGEX.test(this.responseText || "")) fireIfAccepted("xhr");
          } catch (e) {}
        }
      });
      return originalSend.apply(this, args);
    };
  }

  // --- Reset arming state on SPA navigation between problems ---
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      disarm();
    }
  }, 1000);

  log("inject.js ready on", location.href);
})();
