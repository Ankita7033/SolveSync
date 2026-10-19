# CodeChef → GitHub Sync

A Chrome/Edge extension that **automatically commits your accepted CodeChef
solutions** to a GitHub repository the moment they're judged **AC**.

It works by transparently observing CodeChef's own submit/verdict network
traffic (it never blocks or alters anything), grabbing the exact code you
submitted plus the verdict, and — on **Accepted** — pushing the file to your
repo via the GitHub REST API.

```
codechef_solution/
├── FLOW001/
│   └── FLOW001.cpp
├── START01/
│   └── START01.py
└── ...
```

Each file gets a header comment with the problem code, URL, language, and date.

---

## 1. Create the GitHub repo

1. On GitHub, create a repository named **`codechef_solution`** (private is fine).
2. Make sure it has at least one commit / a default branch (`main`). Ticking
   "Add a README" during creation is enough.

## 2. Create a fine-grained Personal Access Token (recommended)

1. GitHub → **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
2. **Repository access → Only select repositories → `codechef_solution`**.
3. **Permissions → Repository permissions → Contents → Read and write**.
4. Generate and copy the token (`github_pat_…`). You won't see it again.

> Fine-grained + single-repo + Contents-only = the token can *only* touch this
> one repo. That's why a PAT is safer here than a broad OAuth grant.

## 3. Load the extension

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked** and select this `codechef-github-sync` folder.

## 4. Configure it

1. Click the extension icon to open the popup.
2. Fill in:
   - **GitHub username** (the repo owner)
   - **Repository** — `codechef_solution`
   - **Branch** — `main`
   - **Token** — paste your fine-grained PAT
   - Leave **Auto-commit on Accepted** checked.
3. Click **Save settings**, then **Test connection**. You should see
   `Connected as <you>` and your repo's details.

## 5. Use it

Just solve problems on CodeChef as usual. When a submission is judged
**Accepted**, the extension commits it and shows a desktop notification.

- The **Commit last captured solution** button in the popup lets you push the
  most recent submission manually (useful for testing or if a notification was
  missed).

---

## How it works (internals)

| File | Runs in | Role |
|------|---------|------|
| `injected.js` | page context | Wraps `fetch`/`XHR` to observe submit payload + verdict |
| `content.js`  | content-script world | Relays captured data; triggers commit on AC |
| `background.js` | service worker | Talks to the GitHub REST API, writes files |
| `popup.html/js` | popup | Settings + connection test + manual commit |

Nothing is sent anywhere except **GitHub** (`api.github.com`) with your token.
Your token and settings live in `chrome.storage.local` on your machine only.

## Troubleshooting

- **"AC detected but no source captured yet"** — CodeChef occasionally changes
  its submit endpoint field names. Open the popup and use **Commit last captured
  solution**; if that's also empty, the interceptor didn't see the request.
  Reload the problem page and re-submit. As a fallback the extension also reads
  the ACE editor's contents.
- **`GitHub 404`** on commit — the repo/branch name is wrong, or the token
  doesn't have Contents: Read and write on that repo.
- **`GitHub 409`** — a rare write conflict; just re-submit or use the manual
  commit button.
- **No notification** — commits still happen; some Chrome setups suppress the
  data-URI icon. Check the repo directly.

## Notes & limitations

- CodeChef has **no official public API**, so this relies on observing its
  internal endpoints. If CodeChef overhauls its submit flow, `injected.js`'s
  field/URL matching may need updating (it's written to be tolerant).
- This captures solutions **going forward**, from the moment it's installed. It
  does not back-fill previously solved problems (there's no API that exposes old
  submission source code).
- Works on Chromium browsers (Chrome, Edge, Brave). Manifest V3.
