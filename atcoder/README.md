# AtCoder → GitHub Sync

A Chrome/Edge/Brave extension (Manifest V3) that **automatically commits your
Accepted (AC) AtCoder solutions** to a GitHub repository named `atcoder_solution`.

When you submit a solution on AtCoder and it gets an **AC** verdict, the
extension grabs your source code + language + task info and pushes it to your
repo — no manual copy-paste.

## Repo layout it creates

```
atcoder_solution/
├─ abc300/
│  ├─ abc300_a/
│  │  ├─ abc300_a.cpp
│  │  └─ README.md
│  └─ abc300_b/
│     ├─ abc300_b.py
│     └─ README.md
├─ arc180/
│  └─ arc180_a/
│     ├─ arc180_a.rs
│     └─ README.md
```

One folder per **contest**, then one folder per **task id** containing the
solution file and a small README with the task link, language, submission link,
and solved date. (AtCoder groups problems by contest, so contest folders are the
natural layout — no external difficulty lookup needed.)

## Why a fine-grained Personal Access Token (not OAuth)

This is a personal, single-user tool, so a **fine-grained PAT scoped to just the
`atcoder_solution` repo** is the simplest and safest choice — no backend server
to host, revocable anytime, and it can't touch any of your other repos. (OAuth or
a GitHub App would only matter if you were publishing this for many users, and
both need a server just to handle the auth callback.)

## Setup

### 1. Create the repo
On GitHub, create an empty repo named **`atcoder_solution`**. Add a README on
creation so the `main` branch exists.

### 2. Create the token
1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access:** *Only select repositories* → `atcoder_solution`.
3. **Permissions → Repository permissions → Contents:** **Read and write**.
4. Generate and copy the `github_pat_...` value.

### 3. Load the extension
1. Open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `atcoder-github-sync/` folder.

### 4. Configure
1. Click the extension icon → **Open settings** (or right-click → Options).
2. Enter your **GitHub username**, confirm repo `atcoder_solution` and branch `main`.
3. Paste your **token**, click **Save**, then **Test connection** — it should say
   `Connected … Ready ✓`.

### 5. Use it
Go solve a problem on AtCoder. On an **AC** verdict you'll get a notification
`Pushed <task> ✓` and the file appears in your repo.

## How it works (and where to tweak)

AtCoder has no public "solution accepted" webhook, so the extension works inside
the page:

- `interceptor.js` (injected into the page) monkey-patches `fetch`/`XMLHttpRequest`
  to read AtCoder's own submission **status poll**
  (`/contests/<c>/submissions/me/status/json`). When a submission reaches a final
  **AC** verdict, it dispatches an event with the submission id.
- `content.js` then fetches that submission's **detail page**
  (`/contests/<c>/submissions/<id>`), which contains the actual source
  (`#submission-code`), the task link, and the language, and messages the
  background worker. It also handles the case where you open a submission detail
  page directly (parses it in place).
- `background.js` commits the file(s) via the GitHub REST Contents API, updating
  in place if the file already exists and skipping identical re-submits.

### If pushes don't fire
AtCoder occasionally changes its front-end, so field/URL names may drift. Open
**DevTools → Console** on the AtCoder tab and look for `[AC→GH]` logs:

- `interceptor active` / `content bridge active` → scripts loaded.
- `final AC detected for submission <id>` → verdict detected from the status poll.
- `background result: {status: "pushed", …}` → committed.

If the verdict is detected but nothing commits, check the console for a
`push failed` message (usually a token/permission issue — re-run **Test
connection** in options). If AC is never detected, AtCoder may have changed the
status-poll HTML — adjust `isFinalAccepted()` in `interceptor.js`. If source
isn't captured, adjust the `#submission-code` selector in `parseSubmissionDoc()`
in `content.js`.

### Language → file extension
AtCoder's language strings carry versions (e.g. `C++ 17 (GCC 8.2.0)`,
`Python (CPython 3.11.4)`, `PyPy3 (7.3.0)`). `extFor()` in `content.js` maps them
to file extensions — extend the `LANG_EXT` table / heuristics there for anything
missing (defaults to `.txt`).

## Privacy / security
- Your token lives only in the browser's extension storage and is sent only to
  `api.github.com`. Nothing goes to any third-party server.
- The extension only runs on `https://atcoder.jp/*` and talks to `api.github.com`.
- Only clean **full-AC** submissions are pushed (partial/other verdicts are skipped).
