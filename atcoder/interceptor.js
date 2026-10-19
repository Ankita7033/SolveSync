// Runs in the PAGE (MAIN) world. AtCoder judges submissions asynchronously and
// the submissions page polls a JSON status endpoint:
//     /contests/<contest>/submissions/me/status/json?reload=true&sids=<id>,<id>
// The response looks like:
//     { "Result": { "<sid>": { "Html": "<td>...<span class='label label-success'>AC</span>...</td>",
//                              "Score": "100" } },
//       "Interval": 3000 }   // "Interval" present only while still judging
//
// We patch fetch + XHR to read those responses. When a submission reaches a
// FINAL "AC" verdict we hand the submission id + contest to the isolated content
// script (which fetches the submission detail page for the actual source code).
(function () {
  const TAG = "[AC→GH]";

  // Contest slug from the current URL, e.g. /contests/abc300/... -> "abc300".
  function contestFromUrl(url) {
    const m = String(url || "").match(/\/contests\/([^/]+)\//);
    return m ? m[1] : null;
  }

  // Decide whether a status cell's HTML represents a FINAL Accepted verdict.
  // AtCoder renders the final AC as a green success label with the text "AC".
  // Still-judging states show "WJ", "1/10", a progress bar, etc. (no success
  // label), and non-AC finals use label-warning / label-danger (WA, TLE, RE…).
  function isFinalAccepted(html) {
    if (typeof html !== "string") return false;
    const h = html;
    // Must contain an AC token as the label text, not a substring of another
    // word. AtCoder uses exactly ">AC<" for the accepted label.
    const hasAcToken = />\s*AC\s*</.test(h);
    if (!hasAcToken) return false;
    // Guard against transient states that also render a success-ish label:
    // require the success class and no explicit "waiting/judging" markers.
    const looksSuccess = /label-success/.test(h) || hasAcToken;
    const stillJudging = /(WJ|WR|Judging|\bWaiting\b|progress-bar|<span[^>]*>\s*\d+\s*\/\s*\d+\s*<)/i.test(h);
    return looksSuccess && !stillJudging;
  }

  function handleStatusJson(json, url) {
    if (!json || typeof json !== "object" || !json.Result) return;
    const contest = contestFromUrl(url) || contestFromUrl(location.pathname);
    for (const sid of Object.keys(json.Result)) {
      const entry = json.Result[sid] || {};
      if (isFinalAccepted(entry.Html)) {
        window.dispatchEvent(
          new CustomEvent("AC_GH_ACCEPTED", {
            detail: { sid: String(sid), contestCode: contest },
          })
        );
        console.log(TAG, "final AC detected for submission", sid, "in", contest);
      }
    }
  }

  function looksLikeStatusUrl(url) {
    return typeof url === "string" && /\/submissions\/me\/status\/json/i.test(url);
  }

  // ---- patch fetch ----
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    const resp = await origFetch.apply(this, arguments);
    try {
      if (looksLikeStatusUrl(url)) {
        resp
          .clone()
          .json()
          .then((j) => handleStatusJson(j, url))
          .catch(() => {});
      }
    } catch (_) {}
    return resp;
  };

  // ---- patch XHR ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ac_url = url;
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const url = this.__ac_url;
    if (looksLikeStatusUrl(url)) {
      this.addEventListener("load", function () {
        try {
          handleStatusJson(JSON.parse(this.responseText), url);
        } catch (_) {}
      });
    }
    return origSend.apply(this, arguments);
  };

  console.log(TAG, "interceptor active");
})();
