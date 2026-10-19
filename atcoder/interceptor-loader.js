// Runs in the ISOLATED content-script world at document_start.
// Its only job is to inject interceptor.js into the PAGE's MAIN world so we can
// monkey-patch the page's own fetch/XHR (AtCoder's submission status polling).
(function () {
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("interceptor.js");
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
    s.onload = () => s.remove();
  } catch (e) {
    console.error("[AC→GH] interceptor inject failed", e);
  }
})();
