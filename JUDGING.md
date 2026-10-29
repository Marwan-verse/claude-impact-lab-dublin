# Guide for evaluators

A factual map of what The Unfinished Work Vault does, how to check it quickly, and where the evidence for each judging criterion is. Every claim below points to code, a test or a recorded run. Limitations are listed at the end.

## In one paragraph

**Who:** developers who use AI coding agents. **Problem (compression burnout):** agents make each task faster, so people start more of them. The day ends with several half-finished changes whose context lives only in their head, so stopping feels risky and the evening goes on "just finishing" or keeping it all in mind. **What the Vault does:** in a short flow (a folder path and up to three optional notes), it inspects a local Git project, writes a short AI handover that keeps your notes, observed evidence and model inference separate, and copies the working files into a local, integrity-hashed vault. Later you read the handover, verify the snapshot and restore it to a new folder. **Time returned:** the evening, because nothing has to be finished or remembered before stopping, and the restart, because the handover replaces reconstructing context from memory. It adds no notifications, streaks or check-ins.

**Brief direction:** the deck's *shutdown command* direction, combined with an *understanding check* before resuming. The Vault does not pause agents; it makes stopping safe.

## Check it in about five minutes

Requires Node.js 20+, npm and Git.

```sh
npm ci
npm --prefix backend test          # 76 tests; real Git and filesystem, no API key needed
npm run build
sh scripts/make-demo-project.sh    # prints the path of a new half-finished Git project
```

Then start the backend with a model key (see [README: Run the app](README.md#run-the-app)) and run `npm run dev`. In the browser: paste the printed path → **What we found** shows the files to capture and what is skipped (`.env`, `.git`) → answer up to three optional notes → review the exact context that will be sent → generate and edit the handover → save → open it → **Check recovery** → **Restore to new folder**.

Without a key, the test suite still exercises inspection, capture, hashing, verification and restore on real temporary Git repositories. Only the model's HTTP call is stubbed.

## Evidence by criterion

### Takes on the problem (30%)

| Claim | Evidence |
| --- | --- |
| Named audience and burnout mechanism | [README](README.md#who-it-is-for-and-the-problem), [docs/brief.md](docs/brief.md) |
| Linked to a suggested direction | Shutdown command plus understanding check (above); [docs/vault-plan.md](docs/vault-plan.md) |
| Makes stopping safe rather than adding work | No timers, alerts or tracking exist in [`src/App.jsx`](src/App.jsx) or [`backend/server.mjs`](backend/server.mjs); the app does nothing until it is opened. |

### Actually works (30%)

| Step | Real implementation |
| --- | --- |
| Inspect Git state without reading source contents | `inspectProject`, [`backend/vault.mjs:66`](backend/vault.mjs) |
| Show exactly what will be sent before any model call | `POST /api/handover/preview`, [`backend/server.mjs:160`](backend/server.mjs) |
| Generate the handover (Anthropic or TensorX) | [`backend/claude.mjs`](backend/claude.mjs), [`backend/tensorx.mjs`](backend/tensorx.mjs); `POST /api/handover/generate`, [`backend/server.mjs:174`](backend/server.mjs) |
| Capture files with SHA-256 manifest; original untouched | `createSnapshot`, [`backend/vault.mjs:153`](backend/vault.mjs) |
| Verify integrity | `verifySnapshot`, [`backend/vault.mjs:219`](backend/vault.mjs) |
| Restore to a new folder only, never overwriting, plus a `VAULT-RESUME.md` | `restoreSnapshot` and `resumeNote` in [`backend/vault.mjs`](backend/vault.mjs) |
| UI wired to these endpoints | [`src/App.jsx`](src/App.jsx), [`src/Evidence.jsx`](src/Evidence.jsx) |

**Automated tests (76, all passing):** [`test/`](test/). Examples: *snapshot verifies and restores actual working files while excluding secrets and dependencies*; *verification reports changes, missing and extra files and blocks restoration*; *unsafe roots and existing destinations are rejected without modifying the project*; *rejects overlapping staged and unstaged changes without losing index content*; *TensorX authentication failures are actionable without leaking the response*.

**Live run, 29 October 2026,** with a real TensorX key and model `deepseek/deepseek-v4.1-flash`, on a project from `scripts/make-demo-project.sh`, using the same endpoint sequence as the UI:

```text
# Condensed from two live runs of the same flow; output abbreviated.
capture: files [README.md, src/api.js, src/chart.js]   skipped [.env, .git]
provider: TensorX
handover (excerpt):
  ## Current state (evidence)
  - Unstaged changes: src/api.js (modified, not staged)
  - Untracked: src/chart.js, .env (.env is excluded from context by policy)
  ## Reported problem (from notes, not independently confirmed)
  - API returns HTTP 429 after a few refreshes.
  ## Evidence vs. inference
  - Inference/untested: the 429 behavior ... src/api.js contents were not provided.
verify:  {"ok":true,"issues":[],"checkedFiles":3}
restore: {"restoredFiles":3}; diff against original: identical; .env not restored
original project: unchanged (git status checked after restore; also covered by tests)
```

**Real browser run, same day:** the full UI flow was driven in Chrome against the live model. Screenshots: [notes, exact context preview, consent and generated handover](docs/screenshots/1-notes-consent-handover.png); [restore result](docs/screenshots/2-return-to-work.png); [saved work list](docs/screenshots/3-home-saved.png).

### Someone would use it (20%)

- Local only: no account, database or cloud service. Works on any ordinary Git project.
- Setup is `npm ci` plus two start commands; the [README](README.md#run-the-app) lists exact commands and environment variables.
- `scripts/make-demo-project.sh` provides a realistic project to try it on immediately.
- Safety a developer would expect: consent before any model call; `.env`, `node_modules` and build outputs are excluded; restore never overwrites; errors never echo keys or provider responses (covered by tests).

### Gives time back (20%)

- **Stopping:** the flow is one folder path plus up to three optional one-line notes; the model drafts the handover. Nothing must be committed, tidied or remembered first.
- **Restarting:** the restored folder contains `VAULT-RESUME.md` (notes, handover, original branch and commit, and what was not restored), so the first step back is reading one file. In the app, "The short version" states goal, current changes, unresolved issue and next step, with evidence and inference labelled, so the user checks it instead of reconstructing it.
- **No new obligations:** no notifications, reminders, streaks or productivity metrics. The time saved goes back to the person, not into more throughput.
- We have **not measured** time saved in a study. The benefit is argued from the workflow, not from data.

## Limitations (stated plainly)

- Local single-user tool; the API is unauthenticated and binds to `127.0.0.1` only.
- Restores working files only: not Git history or staging, dependencies, environment variables, credentials or running processes. Verification checks file integrity, not that the app runs.
- Repositories with submodules or active Git clean/process filters are rejected.
- Tracked or unignored secrets cannot be detected automatically; the capture preview lists every file for review.
- Live TensorX generation is verified through both the API and the browser UI (above); live Anthropic generation has not been verified.

Full details: [docs/backend-api.md](docs/backend-api.md).
