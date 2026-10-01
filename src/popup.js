const MSG_GET_LOG = "GFG_SYNC::GET_LOG";

chrome.runtime.sendMessage({ type: MSG_GET_LOG }, (res) => {
  const log = (res && res.log) || [];
  const el = document.getElementById("log");
  if (!log.length) {
    el.textContent = "No pushes yet. Solve a problem on GeeksforGeeks and hit Submit.";
    return;
  }
  el.innerHTML = log
    .slice(0, 8)
    .map((e) => (e.ok ? `<div>✅ ${e.title || ""} → ${e.path}</div>` : `<div>❌ ${e.title || ""}: ${e.error}</div>`))
    .join("");
});

document.getElementById("openOptions").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
