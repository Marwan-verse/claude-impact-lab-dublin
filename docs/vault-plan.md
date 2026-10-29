# The Unfinished Work Vault

> Put it down. Pick it up when you're ready.

## The idea

AI makes it easy to start experiments. Unfinished changes, running agents, scattered notes, and uncertainty about the next step can make it difficult to stop. The Vault helps a developer put unfinished work aside and return to it with a verified snapshot and a short restart guide. It aims to reduce context-recovery effort and protect time away from work.

The primary user is a developer using Claude Code who needs to stop with a half-built feature. For example, a dashboard has uncommitted changes and an unresolved API issue. The developer captures it, closes the editor, and later restores it to a new folder with the saved state and next step.

## User experience

### Put work away

1. Choose a discovered recent Codex or Claude Code Git project, or enter a local Git project manually. Discovery lists candidates; it does not archive them.
2. Review project location, current branch and commit, changed/staged/untracked files, and snapshot exclusions.
3. Optionally describe the goal, known issues, and the next step.
4. Prepare an editable local handover, or review the outbound context and selected provider and explicitly consent before generating one. Do not send source files by default.
5. Review the handover and save the experiment, capturing permitted project files into a local vault with a manifest.

The handover separates **checked facts**, **user notes**, and **model interpretation**. It states the goal, current changes, unresolved issues, and one useful next action. Unverified statements must not appear as checked facts.

### Return to work

1. Open an experiment card and read its short restart guide.
2. Inspect captured Git state, files, exclusions, and setup evidence.
3. Verify the snapshot against its manifest.
4. Restore captured files into a new destination folder; never overwrite the source.
5. Show the restart guide and any missing environment variables, dependencies, or unverified setup requirements.

Snapshot integrity verifies captured files, not that the application runs or that services and credentials are restored. Make this distinction visible.

## Minimum viable product

- Local Git project inspection: branch, commit, Git status, setup files.
- Local snapshot of explicitly permitted files, with paths and hashes in a manifest.
- Provider-generated editable handover based on selected evidence and user notes.
- Dashboard of saved experiments and a detail screen.
- Integrity check and real restoration to a new folder.
- Clear success, failure, exclusion, and limitation states.

Do not include arbitrary process stopping, automatic agent-conversation capture, cloud/database recovery, team accounts, sync, or broad operating-system support in the initial slice. Document actual platform support during implementation.

## Visual direction

The product should feel like a quiet personal library. Use deep charcoal or midnight blue, warm cream text, muted blue-green for verified states, restrained amber for attention, generous spacing, subtle borders, and clear typography. Avoid streaks, urgency, notification pressure, and guilt-inducing language. A gentle folder-on-a-shelf animation is optional and should respect reduced-motion settings.

### Dashboard

Show the name, tagline, a prominent **Put work away** action, and cards containing project name, saved date, verification status, next step, and **Open handover**. Empty state: “Your work will be here when you're ready to return.”

### Experiment detail

Three sections: **The short version** (goal, current state, next step); **What was captured** (Git state, files, exclusions, evidence); **Return to work** (check recovery, restore to new folder, missing requirements). Keep the explanation scannable on a laptop.

## Proposed architecture

- Frontend: React and Vite.
- Local backend: Node.js HTTP server, required for local project inspection and restoration.
- Local storage: snapshots, manifests, and JSON experiment metadata.
- Git: local commands for state inspection.
- Anthropic (default) or TensorX API: handover generation using only selected context. See the [README](../README.md) for provider configuration and hidden TensorX key entry.

Capture: select project → inspect Git and setup evidence → review provider and exact context → consent and generate handover → user review → save permitted files and manifest.

Restore: select experiment → verify manifest → choose new destination → restore files → report actual results and outstanding setup.

Exclude `.env` files, dependencies, and build output by default; make exclusions visible. Keep credentials outside the snapshot and repository. Treat paths and project contents as untrusted data. Prevent paths or symlinks from escaping the selected roots, and reject an existing restore destination rather than overwriting it. Never claim arbitrary agents were stopped or a full environment reproduced.

## API contract

| Endpoint | Purpose |
| --- | --- |
| `POST /api/inspect` | Inspect a project and return capture options. |
| `POST /api/handover/preview` | Prepare the exact outbound context for review. |
| `POST /api/handover/generate` | Generate a handover after review. |
| `POST /api/vaults` | Create a snapshot and handover through the direct API. |
| `GET /api/vaults` | List experiments. |
| `GET /api/vaults/:id` | Read a saved experiment. |
| `PATCH /api/vaults/:id` | Save edits to a handover. |
| `POST /api/vaults/:id/verify` | Check snapshot integrity. |
| `POST /api/vaults/:id/restore` | Restore to a new destination. |

The local backend and frontend implement these endpoints; see `docs/backend-api.md` for the request and response fields, consent requirements, limitations, and verification status. Live TensorX generation has been verified through the API; live Anthropic has not (see `docs/backend-api.md`). TensorX may bill separately; do not assume Anthropic event credits apply. The event allows any handover model (confirmed 29 October 2026); the product is built with Claude Code and the organiser's Claude judge is unchanged.

## Two-person work split

### Person 1: product, interface, and demo

1. Set up React/Vite and visual components.
2. Build dashboard, experiment cards, and empty state.
3. Build project capture form and evidence/exclusions review.
4. Build handover, verification, and restoration screens.
5. Distinguish checked facts, user notes, and AI interpretation.
6. Handle loading, success, failure, and smaller-screen layouts.
7. Integrate the backend endpoints and prepare the live demo.

Done means a user can complete the actual capture → inspect → verify → restore flow from the interface, with understandable errors and no hidden manual steps.

### Person 2: capture, handover generation, and recovery

1. Set up the local Node server and vault storage.
2. Inspect Git state and project setup evidence.
3. Capture permitted files with visible exclusions and generate a manifest.
4. Verify snapshot integrity and report failures.
5. Integrate the selected model provider for an editable, evidence-grounded handover.
6. Restore into a new folder with path and destination checks.
7. Handle invalid projects, unavailable Git/API, missing files, and destination conflicts.
8. Write exact setup instructions and prepare a real half-finished example project.

Done means real captured files are verified and restored without overwriting the original, limitations are accurate, and a stranger can follow the README.

### Shared integration

Agree the API contract in the first 15 minutes. During final verification Person 1 drives the UI; Person 2 checks the real filesystem and restored contents. Both review the README and submission description.

## Proposed three-hour schedule

All times 29 October 2026, Europe/Dublin; team targets, not organiser rules. Reduce scope if starting late.

| Time | Person 1 | Person 2 |
| --- | --- | --- |
| 17:30–17:45 | Sketch screens, colours, contract. | Define capture, exclusions, contract. |
| 17:45–18:30 | Dashboard, capture form, cards. | Git inspection and snapshot creation. |
| 18:30–19:00 | Detail and recovery UI. | Manifest verification and model handover. |
| 19:00–19:30 | Connect real endpoints and states. | Restore to new folder. |
| 19:30–20:00 | Polish and demo walkthrough. | Test recovery, failures, README. |
| 20:00–20:15 | Rehearse together. | Verify restored files and setup. |
| 20:15–20:25 | Prepare submission and accessible link. | Check code, sensitive data, judge access. |
| 20:30 | Submission closes. | Submission closes. |

If time is tight, cut animation and advanced context capture first. Preserve actual capture, verification, and restore.

## Acceptance criteria

- [ ] Select a real local Git project and save it in the Vault.
- [ ] Capture Git state and a snapshot of permitted files.
- [ ] Produce an editable model handover with identified evidence.
- [ ] Show exclusions and distinguish checks from unverified claims.
- [ ] Verify integrity and restore actual files to a new directory.
- [ ] Leave the original project unchanged.
- [ ] A stranger can run the app and repeat the workflow from the README.
- [ ] The submission link is accessible to the judge before 20:30.

## Demo

Opening: “AI makes it easy to start work. It doesn't make it easy to stop.”

1. Show a real project with unfinished changes.
2. Select it, enter a goal and an unresolved issue, and capture it.
3. Show checked Git state, exclusions, and the editable handover.
4. Close the project, verify the snapshot, and restore it to a new folder.
5. Show actual restored changes and the restart guide.

Closing: “The Vault gives you a reliable way back.” Compare time to regain context with and without the guide as a small demonstration, not a proven productivity study.

## Judging alignment

| Criterion | Evidence |
| --- | --- |
| Problem fit, 30% | Helps developers stop unfinished AI-assisted work without carrying its context mentally. |
| Works, 30% | Actual capture, integrity check, and restore; no faked core flow. |
| Useful afterward, 20% | Local setup, real interface, clear exclusions and limitations, self-contained README. |
| Gives time back, 20% | Reduces end-of-day handover and next-session context recovery without recurring alerts. |

The organiser's Claude-based judging agent reads the README and code or accessible live site plus submission description. Keep claims consistent with implemented evidence. The repository was made public by the user on 29 October 2026 for judging.

## Current extensions

The implemented app adds project status, a reviewed end-of-day queue, recovery checklists, comparisons between snapshots, a decision journal, a context map and local teammate handoff review. Project metadata is separate from the file snapshot. See the README for usage and limits.
