# GFG Solution Sync

Chrome/Edge extension that watches GeeksforGeeks Practice problem pages and, when you
click **Submit** and get an Accepted verdict, pushes the exact code you submitted to
your GitHub repo (`Ankita7033/GFG_solution` by default) via the GitHub Contents API.

## How it works

- `src/inject.js` runs in the page's own JS context. It captures the code and language
  the moment you click **Submit**, then watches the DOM and the page's own
  fetch/XHR traffic for an "Accepted"/"Correct Answer" verdict for up to 45s.
- On a confirmed Accepted, it hands the snapshot to `src/content.js`, which forwards it
  to the background service worker.
- `src/background.js` commits the file to `<difficulty>/<problem-slug>.<ext>` in your
  repo using the GitHub Contents API. If the file already exists with identical
  content, the push is skipped.

## Setup

1. **Create a scoped GitHub token** (2 minutes):
   - Go to https://github.com/settings/personal-access-tokens/new
   - Resource owner: your account. Repository access: **Only select repositories** → `GFG_solution`.
   - Permissions → Repository permissions → **Contents: Read and write**. Leave everything else as "No access".
   - Generate and copy the token (starts with `github_pat_`).
2. **Load the extension**:
   - Open `chrome://extensions`, enable Developer mode, click "Load unpacked", select this folder.
3. **Configure it**:
   - Click the extension icon → Settings (or right-click the icon → Options).
   - Paste the token, confirm owner (`Ankita7033`) and repo (`GFG_solution`), click "Test connection", then Save.
4. Go solve a problem on geeksforgeeks.org/problems/... and click Submit. On Accepted,
   check the extension popup or the repo for the new commit.

## Notes / limitations

- Only public GFG Practice problems that use the Ace-based in-browser editor are supported
  (that's the standard practice portal editor).
- Verdict text matching is a regex (`correct answer`, `accepted`, `all test cases passed`).
  If GFG changes its wording, update `ACCEPT_REGEX` in `src/inject.js`.
- The token is stored in the extension's local storage (`chrome.storage.local`), which is
  private to this extension/browser profile. Revoke it anytime from GitHub settings.
