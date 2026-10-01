// Isolated-world bridge: relays the solved-problem payload from inject.js
// (MAIN world, no chrome.* access) to the background service worker.
const MSG_TAG = "GFG_SYNC::SOLVED";

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.type !== MSG_TAG) return;

  chrome.runtime.sendMessage({ type: MSG_TAG, payload: data }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("[GFG Sync] failed to reach background:", chrome.runtime.lastError.message);
    } else if (response && !response.ok) {
      console.error("[GFG Sync] push failed:", response.error);
    } else {
      console.debug("[GFG Sync] pushed to GitHub:", response && response.path);
    }
  });
});
