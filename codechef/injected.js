/*
 * injected.js  —  runs in the CodeChef PAGE context (not the isolated content-script world).
 *
 * CodeChef submits code and polls the verdict over its own internal AJAX endpoints.
 * The cleanest, most robust way to capture BOTH "the exact code you submitted" and
 * "the verdict" is to transparently wrap fetch() and XMLHttpRequest, read what flows
 * through, and forward the interesting bits to the content script via window.postMessage.
 *
 * We never block, delay, or alter any request — we only observe copies.
 */
(function () {
  "use strict";

  const CHANNEL = "cc-gh-sync";

  // Most-recent captured submission payload, so a later verdict can be matched to it.
  let lastCapture = null;

  function emit(type, payload) {
    try {
      window.postMessage({ source: CHANNEL, type, payload }, "*");
    } catch (_) {}
  }

  // ---- body parsing -------------------------------------------------------

  function parseBody(body) {
    if (body == null) return {};
    if (typeof body !== "string") {
      try {
        if (body instanceof URLSearchParams) return Object.fromEntries(body.entries());
        if (typeof FormData !== "undefined" && body instanceof FormData)
          return Object.fromEntries(body.entries());
      } catch (_) {}
      return {};
    }
    // JSON?
    try { return JSON.parse(body); } catch (_) {}
    // url-encoded?
    try {
      const p = new URLSearchParams(body);
      const o = Object.fromEntries(p.entries());
      if (Object.keys(o).length) return o;
    } catch (_) {}
    return {};
  }

  // Pull the source/lang/problem out of a request body, tolerating field-name drift.
  function captureFromRequest(url, body) {
    const d = parseBody(body);
    const source =
      d.sourceCode || d.source || d.source_code || d.code || d.solution || null;
    if (!source) return;

    lastCapture = {
      source,
      language: d.language || d.languageId || d.language_id || d.lang || null,
      problemCode:
        d.problemCode || d.problem_code || d.problem || d.pcode || d.problem_id || null,
      contestCode:
        d.contestCode || d.contest_code || d.contest || d.contestId || null,
      url,
      at: Date.now(),
    };
    emit("submission", lastCapture);
  }

  // ---- verdict detection --------------------------------------------------

  // Recursively hunt for anything that looks like an "accepted" verdict.
  function detectVerdict(obj, depth) {
    if (obj == null || depth > 6) return null;
    if (typeof obj === "string") {
      const s = obj.trim().toLowerCase();
      if (s === "accepted" || s === "ac") return "accepted";
      return null;
    }
    if (typeof obj !== "object") return null;

    // Common CodeChef shapes: { result_code: "accepted" }, { status: "..." },
    // { result: { result_code: "accepted" } }, { data: {...} }
    const keys = ["result_code", "resultCode", "verdict", "status", "result_message", "message"];
    for (const k of keys) {
      if (k in obj) {
        const found = detectVerdict(obj[k], depth + 1);
        if (found) return found;
      }
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const found = detectVerdict(v, depth + 1);
        if (found) return found;
      } else {
        const found = detectVerdict(v, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function captureFromResponse(url, text) {
    if (!text || typeof text !== "string") return;
    let data;
    try { data = JSON.parse(text); } catch (_) { return; }
    const verdict = detectVerdict(data, 0);
    if (verdict) emit("verdict", { verdict, url });
  }

  // ---- fetch() wrapper ----------------------------------------------------

  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (resource, config) {
      const url =
        typeof resource === "string"
          ? resource
          : (resource && resource.url) || "";
      try {
        if (/submit/i.test(url) && config && config.body) {
          captureFromRequest(url, config.body);
        }
      } catch (_) {}

      const p = origFetch.apply(this, arguments);
      try {
        if (/submit|status|solution|result/i.test(url)) {
          p.then((resp) => {
            try {
              resp.clone().text().then((t) => captureFromResponse(url, t)).catch(() => {});
            } catch (_) {}
          }).catch(() => {});
        }
      } catch (_) {}
      return p;
    };
  }

  // ---- XMLHttpRequest wrapper --------------------------------------------

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ccUrl = url;
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__ccUrl || "";
    try {
      if (/submit/i.test(url) && body) captureFromRequest(url, body);
    } catch (_) {}
    this.addEventListener("load", function () {
      try {
        if (/submit|status|solution|result/i.test(url)) {
          captureFromResponse(url, this.responseText);
        }
      } catch (_) {}
    });
    return origSend.apply(this, arguments);
  };

  // ---- ACE editor fallback -----------------------------------------------
  // If the request body ever fails to expose the source, the content script can
  // ask us to read it straight out of CodeChef's ACE editor.
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== CHANNEL || msg.type !== "readEditor") return;
    let code = null;
    try {
      if (window.ace && typeof window.ace.edit === "function") {
        const el = document.querySelector(".ace_editor");
        if (el) code = window.ace.edit(el).getValue();
      }
    } catch (_) {}
    if (!code) {
      const ta = document.querySelector("textarea[name='program'], textarea.ace_text-input");
      if (ta && ta.value) code = ta.value;
    }
    emit("editorContent", { code });
  });

  emit("ready", { at: Date.now() });
})();
