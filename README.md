# SolveSync

**Automatically commit your Accepted solutions from GeeksforGeeks, CodeChef and AtCoder to GitHub.**

Submit a solution, get an Accepted verdict, and the exact code you submitted lands in your GitHub repo a few seconds
later, with the problem name and language in the commit message. No copy-paste, no forgotten problems.

## Why I built it

I practise DSA every day on GeeksforGeeks, CodeChef and AtCoder, and I wanted a record of it: something I could look
back on to see how much I've learned, and that recruiters could see too. LeetCode already had
[LeetHub](https://github.com/arunbhardwaj/LeetHub-2.0), which I use, but these three platforms had nothing like it.
Copying every solution to GitHub by hand was tedious enough that I kept skipping it, so I automated it.

I started with GeeksforGeeks, used it daily, then built the same tool for CodeChef and AtCoder.
My [GFG_solution](https://github.com/Ankita7033/GFG_solution) repo is kept up to date by it.

## Status

SolveSync currently contains **three working extensions**, one per platform, which are being merged into a single
extension with one setup.

| Folder | Platform | Default target repo | Layout it creates |
|---|---|---|---|
| [`gfg/`](gfg) | GeeksforGeeks Practice | `GFG_solution` | `<difficulty>/<problem-slug>.<ext>` |
| [`codechef/`](codechef) | CodeChef | `codechef_solution` | `<PROBLEM_CODE>/<PROBLEM_CODE>.<ext>` |
| [`atcoder/`](atcoder) | AtCoder | `atcoder_solution` | `<contest>/<task>/<task>.<ext>` plus a short README |

Each folder has its own README with platform-specific setup.

## How it works

1. **Capture the exact submitted code.** The code is taken at the moment of submission (the GFG version snapshots
   the editor when you click Submit; the CodeChef and AtCoder versions read the site's own submission traffic). It is
   never read from the editor after the verdict arrives.
2. **Confirm the verdict.** The extension watches for an Accepted result. The GFG version checks two signals for up to
   45 seconds: the page's network responses (fast path) and the page content (fallback if GFG changes its API).
3. **Commit to GitHub.** The background service worker pushes the file through the
   [GitHub Contents API](https://docs.github.com/en/rest/repos/contents). If the problem was solved before, the file is
   updated in place; the GFG version skips the commit when the code is unchanged.

The extensions only talk to their platform's website and `api.github.com`. Nothing is sent anywhere else.

## Design decisions

**Snapshot at Submit, not at verdict.** The obvious approach is to wait for "Accepted" and then read the editor.
Judging takes several seconds, and any edit made in that time would be committed as if it had passed, which would
quietly corrupt the record this tool exists to keep. Taking the code from the submission itself means the committed
file is exactly what the judge accepted.

**A repo-scoped token instead of OAuth.** A full GitHub login flow (OAuth) needs a server to keep its client secret
hidden: extra infrastructure and extra attack surface for a personal tool. A fine-grained personal access token
limited to one repository, with write access to file contents only, gives the extension the least access it needs
and can be revoked at any time. The trade-off is a two-minute manual setup per user.

## Setup

1. **Create the target repo** on GitHub (for example `GFG_solution`). Tick "Add a README" so the `main` branch exists.
2. **Create a fine-grained token:**
   - GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token
   - Repository access: **Only select repositories** → your target repo
   - Repository permissions → **Contents: Read and write**. Leave everything else at "No access".
   - Copy the token (it starts with `github_pat_`).
3. **Load the extension:** open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click
   **Load unpacked**, and select the platform's folder (`gfg/`, `codechef/` or `atcoder/`).
4. **Configure it:** open the extension's settings, paste the token, confirm the owner, repo and branch, click
   **Test connection**, then save.
5. **Solve a problem.** On Accepted, the extension badge or notification confirms the push, and the commit appears in
   your repo.

The token is stored in the extension's local storage (`chrome.storage.local`), private to that browser profile.

## Known limitations

- **Three separate extensions.** Each platform currently needs its own install and token. Merging them is the next
  step.
- **GFG verdict check is too broad.** The page-content fallback looks for "accepted" or "correct answer" anywhere on
  the page, so a problem statement containing those words could trigger a push for a wrong answer. Fix in progress:
  restrict the check to the verdict area.
- **Depends on each site's wording and network format.** If a platform changes its verdict text or API responses,
  detection may need updating.
- **Manual token setup** for each user (see the OAuth trade-off above).

## Roadmap

- [ ] Merge the three extensions into one, with a single settings page and one token
- [ ] Restrict GFG verdict detection to the verdict area
- [ ] Publish on the Chrome Web Store
- [ ] Optional progress summary (problems solved per platform and difficulty) in the target repo's README

## History

The CodeChef and AtCoder extensions were developed in their own repositories and merged here with full commit
history:
[Codechef-to-Github-Extension](https://github.com/Ankita7033/Codechef-to-Github-Extension) ·
[AtCoder-to-GitHub-Extension](https://github.com/Ankita7033/AtCoder-to-GitHub-Extension).
This repository was previously `GFG_TO_GITHUB`.
