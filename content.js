/*
 * content.js  —  runs in the isolated content-script world on codechef.com.
 *
 * Responsibilities:
 *   1. Inject injected.js into the page context so it can wrap fetch/XHR.
 *   2. Relay captured "submission" + "verdict" messages from the page.
 *   3. When a verdict is ACCEPTED and we hold matching source code, ask the
 *      background service worker to commit it to GitHub.
 */
(function () {
  "use strict";

  const CHANNEL = "cc-gh-sync";

  // Inject the page-context interceptor.
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("injected.js");
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.warn("[CC→GH] failed to inject interceptor", e);
  }

  let lastSubmission = null;
  let committedKey = null; // guards against double-commits for the same verdict burst

  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== CHANNEL) return;

    if (msg.type === "submission") {
      lastSubmission = Object.assign({}, msg.payload);
      // Fill in problem code from the URL if the request body didn't carry it.
      if (!lastSubmission.problemCode) {
        lastSubmission.problemCode = guessProblemFromUrl();
      }
      chrome.storage.local.set({ lastSubmission });
      // If source is missing, ask the page to read the ACE editor.
      if (!lastSubmission.source) {
        window.postMessage({ source: CHANNEL, type: "readEditor" }, "*");
      }
    } else if (msg.type === "editorContent") {
      if (msg.payload && msg.payload.code && lastSubmission && !lastSubmission.source) {
        lastSubmission.source = msg.payload.code;
        chrome.storage.local.set({ lastSubmission });
      }
    } else if (msg.type === "verdict") {
      handleVerdict(msg.payload);
    }
  });

  function guessProblemFromUrl() {
    // e.g. /problems/FLOW001, /submit/FLOW001, /CONTEST/problems/FLOW001
    const m = location.pathname.match(/\/(?:problems|submit)\/([A-Za-z0-9_]+)/);
    return m ? m[1] : null;
  }

  function handleVerdict(payload) {
    const v = String((payload && payload.verdict) || "").toLowerCase();
    const accepted = v.includes("accept") || v === "ac";
    if (!accepted) return;

    chrome.storage.local.get(["lastSubmission", "config"], function (store) {
      const sub = store.lastSubmission || lastSubmission;
      const cfg = store.config || {};
      if (cfg.autoCommit === false) return;
      if (!sub || !sub.source) {
        console.warn("[CC→GH] AC detected but no source captured yet.");
        return;
      }
      const key = (sub.problemCode || "?") + "|" + hash(sub.source);
      if (key === committedKey) return; // already handled this exact solution
      committedKey = key;

      chrome.runtime.sendMessage({ type: "commit", submission: sub }, function (resp) {
        // resp handled by background (notification). Nothing required here.
        if (chrome.runtime.lastError) {
          console.warn("[CC→GH]", chrome.runtime.lastError.message);
        }
      });
    });
  }

  function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return h;
  }
})();
