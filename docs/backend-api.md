# Backend API and local walkthrough

The backend is a local Node HTTP API; there is **no UI yet**. It inspects a Git working tree, sends explicitly confirmed metadata and notes to Claude for a handover, snapshots permitted files locally, and verifies/restores those files. It does not stop agents or recreate a working environment. The intended benefit is less time reconstructing context when you return, not a measured time saving.

## Requirements and configuration

- Node.js 20 or newer, npm and Git. The walkthrough also uses `curl` 7.76.0 or newer (`--fail-with-body`) and `jq`, and assumes a POSIX shell.
- No npm dependencies are currently declared. From the repository root run `npm --prefix backend test` and `npm --prefix backend start`.
- `ANTHROPIC_API_KEY` is required for creating a vault; set it in the server's environment, not a tracked file. Other API operations do not require a key. A real create makes a network request and may use paid API credits.
- Optional: `ANTHROPIC_MODEL` (default `claude-sonnet-5-5`), `ANTHROPIC_WORKSPACE_ID` (sent as the `anthropic-workspace-id` header), `VAULT_ROOT` (default `~/.unfinished-work-vault`) and `PORT` (default `3001`; 1–65535). Relative `VAULT_ROOT` values are resolved by the server. Project, vault and destination paths must avoid symlink components; project and vault must not contain one another.
- The server binds to `127.0.0.1` and has **no authentication**. Other local users/processes can call it. Host and browser Origin checks are not authentication; do not expose it to a network or use it on an untrusted shared machine. Allowed cross-origin browser origins are `http://localhost:5173` and `http://127.0.0.1:5173`.

## What is shared and stored

Inspection is local and returns `capturePreview` (file paths, SHA-256 hashes, and skipped paths) and `contextPreview` (project name, branch, commit, Git status paths, exclusion names and setup-file names). **Review both previews and your notes before explicitly confirming.** The direct create flow requires `confirmed: true` and the unchanged `contextPreview` and `capturePreview`; the backend re-inspects both before and after the Claude request and rejects changes with 409. The frontend flow separately prepares an exact outbound preview, generates after user confirmation, and saves the reviewed editable handover. Capture checks file hashes during copying. The exact `contextPreview` and notes are sent to Claude; source file contents and capture hashes are **not sent by default**. Notes can themselves contain source or secrets, and filenames, branch names, paths and notes may be sensitive. Do not send anything you are not authorised to share. These checks are not race-proof: concurrent changes are unsupported.

The snapshot, manifest, notes and handover stay in the local vault. Capture copies permitted working-tree files, including untracked files, but skips Git-ignored untracked files. Tracked files remain eligible even if an ignore pattern matches. Check `capturePreview.files` carefully: arbitrary tracked or unignored secrets cannot be detected automatically. The fixed exclusions (matched by name at any depth) are `.git`, `.env` and `.env.*`, `node_modules`, `vendor`, `venv`, `.venv`, `env`, `__pycache__`, `dist`, `build`, `target`, `.next`, `.nuxt`, `.output`, `.cache`, `.pytest_cache`, `.mypy_cache`, `.turbo`, `.gradle`, `.tox`, and `coverage`; symlinks and special files are skipped. This also excludes `.env.example`, even if it appears as setup evidence. Capture rejects files with both staged and unstaged changes because restoring only the working-tree version could lose staged work; resolve that state first. Inspection rejects repositories with submodules or active configured Git clean/process filters; it does not execute those filters or fsmonitor hooks. Concurrent changes to Git configuration or attributes are unsupported.

The manifest contains SHA-256 hashes, sizes and modes, but is **not signed**; a party able to modify both files and manifest can defeat the check. Verification checks file paths, contents and sizes, not application correctness or file modes. Restore requires a new destination whose parent already exists, outside the source and vault; it verifies first and does not overwrite an existing destination. Git history, index/staging, credentials, environment variables, installed dependencies and running processes are not restored. Empty directories are not captured. Do not change the project or vault concurrently during capture or restore. Keep local vault contents protected and handle deletion yourself.

## Reproducible unfinished project and API flow

Run from the **repository root** in a POSIX shell. This creates a fresh directory in your home directory, never changes an existing project, and leaves the demo there for your inspection. It uses an example Git identity only for this new repository. `DEMO` must be an absolute path without symlink components; if your home directory contains symlinks, choose a suitable real directory instead.

```sh
DEMO=$(mktemp -d "${HOME}/vault-demo.XXXXXX")
mkdir "$DEMO/project"
git -C "$DEMO/project" init -q
printf 'Initial implementation\n' > "$DEMO/project/app.txt"
git -C "$DEMO/project" add app.txt
git -C "$DEMO/project" -c user.name='Vault Demo' -c user.email='vault-demo@example.invalid' commit -qm 'Initial implementation'
printf 'Unfinished implementation: resolve the API error\n' > "$DEMO/project/app.txt"
printf 'Next: investigate the response\n' > "$DEMO/project/todo.txt"
printf 'SECRET=example-only\n' > "$DEMO/project/.env"
git -C "$DEMO/project" status --short
printf 'Demo directory: %s\n' "$DEMO"
```

In **another terminal**, from this repository root, set the same `DEMO` path printed above, configure your own key securely in that shell, and start the server. Replace the example path; do not paste your key into the repository or a shared terminal recording. Leave the server running for the remaining steps. To change ports, set `PORT` here and change `BASE` below accordingly.

```sh
DEMO='/absolute/path/printed/above'
# Set ANTHROPIC_API_KEY in this shell using your secure method first.
VAULT_ROOT="$DEMO/vault" npm --prefix backend start
```

Back in the first shell, inspect and review **all** output, including filenames and skipped files. The next step sends `contextPreview` and notes to Claude only after your consent. No source file contents are sent automatically.

```sh
BASE='http://127.0.0.1:3001'
jq -n --arg projectPath "$DEMO/project" '{projectPath: $projectPath}' |
  curl --fail-with-body -sS -H 'Content-Type: application/json' --data-binary @- "$BASE/api/inspect" > "$DEMO/inspection.json"
jq . "$DEMO/inspection.json"
```

After reviewing and explicitly consenting to share that context and the following notes, create the vault. If the project changes, inspect and review again. A real API key and a working Claude connection are needed here.

```sh
jq -n --arg projectPath "$DEMO/project" \
  --arg notes 'Goal: finish the implementation. Issue: API error. Next: investigate the response.' \
  --slurpfile inspection "$DEMO/inspection.json" \
  '{projectPath: $projectPath, notes: $notes, confirmed: true, context: $inspection[0].contextPreview, capturePreview: $inspection[0].capturePreview}' |
  curl --fail-with-body -sS -H 'Content-Type: application/json' --data-binary @- "$BASE/api/vaults" > "$DEMO/created.json"
jq . "$DEMO/created.json"
ID=$(jq -er '.id' "$DEMO/created.json")
```

Read the generated handover critically; it is interpretation, not proof. List, read, optionally replace the handover, verify and restore. The example replacement is deliberately labelled as user-edited rather than Claude output.

```sh
curl --fail-with-body -sS "$BASE/api/vaults" | jq .
curl --fail-with-body -sS "$BASE/api/vaults/$ID" | jq .
jq -n --arg handover 'User-reviewed: investigate the API error before continuing.' '{handover: $handover}' |
  curl --fail-with-body -sS -X PATCH -H 'Content-Type: application/json' --data-binary @- "$BASE/api/vaults/$ID" | jq .
curl --fail-with-body -sS -H 'Content-Type: application/json' --data '{}' "$BASE/api/vaults/$ID/verify" | jq .
jq -n --arg destination "$DEMO/restored" '{destination: $destination}' |
  curl --fail-with-body -sS -H 'Content-Type: application/json' --data-binary @- "$BASE/api/vaults/$ID/restore" | jq .
cmp "$DEMO/project/app.txt" "$DEMO/restored/app.txt"
cmp "$DEMO/project/todo.txt" "$DEMO/restored/todo.txt"
test ! -e "$DEMO/restored/.env" && echo 'Excluded .env was not restored'
git -C "$DEMO/project" status --short
```

`cmp` prints nothing on equality. The original working tree remains unfinished; the restored folder is not a Git repository. Stop the server with Ctrl-C in its terminal. The demo and vault remain under the printed directory; remove them only when you have reviewed them and no longer need them.

## Endpoint reference

All request bodies must be JSON objects with `Content-Type: application/json` (optional UTF-8 charset); the default limit is 256 KiB. Successful responses are JSON. UUIDs below must be lowercase version 4 UUIDs. Errors are JSON `{ "error": "message" }`.

| Method and path | Request | Success |
| --- | --- | --- |
| `POST /api/inspect` | `{projectPath: string}` or `{path: string}`: absolute Git repository root, no symlink components. | 200: `{inspectionId, projectPath, projectName, git, exclusions, setupEvidence, limitations, capturePreview, contextPreview}`. `git` is `{branch: string|null, commit: string|null, staged: string[], unstaged: string[], untracked: string[]}`; `capturePreview` is `{files: string[], skipped: string[], fileHashes: [{path, sha256}]}`. `contextPreview` is `{projectName, git, exclusions, setupEvidence}`. |
| `POST /api/handover/preview` | `{inspectionId, goal, issue, nextStep}`; notes are strings and may be empty. | 200: `{previewId, provider, context}`. `context` is the exact serialized material to be sent to Claude; no model call occurs. |
| `POST /api/handover/generate` | `{previewId}` after explicit review and consent. | 200: `{handover}`; each preview is single-use. A failed generation requires a new preview. |
| `POST /api/vaults` | `{projectPath: string, notes: string, confirmed: true, context: object, capturePreview: object}`. Notes may be empty; both previews must exactly match the latest inspection before and after the Claude call. | 201: metadata `{id, createdAt, projectPath, projectName, git, setupEvidence, exclusions, skipped, notes, handover, limitations, fileCount}`. Claude is called before snapshot creation. |
| `POST /api/vaults` (frontend flow) | `{inspectionId, handover}` after successful generation and review. | 201: saves the edited handover and snapshot without a second Claude call; rejects stale inspection or capture previews. |
| `GET /api/vaults` | No body. | 200: array of detailed records, newest first; empty array when the vault root does not exist. |
| `GET /api/vaults/:id` | No body. | 200: metadata plus `manifest: {version: 1, files: [{path, size, sha256, mode}]}`. Size is bytes; mode is a numeric permission mask. |
| `PATCH /api/vaults/:id` | `{handover: string}`; empty string permitted. | 200: updated detailed record including manifest. |
| `POST /api/vaults/:id/verify` | `{}`. | 200: `{ok: boolean, issues: string[], checkedFiles: number}`; `ok: false` is still HTTP 200. |
| `POST /api/vaults/:id/restore` | `{destination: string}`: absolute, new path with existing safe parent, outside source and vault. | 200: `{destination, restoredFiles, limitations, handover}`. Integrity failure or existing destination returns 409. |

Frontend inspection and preview IDs are kept in memory, expire after 15 minutes, and do not survive server restart. Preparing another preview invalidates the prior draft. Typical errors: 400 invalid input, path, Git project or manifest; 403 invalid Host/Origin; 404 missing endpoint/path or expired preview; 409 stale context, failed integrity or destination conflict; 413 oversized body; 415 wrong content type; 503 missing API key; 502 Claude timeout, network, authentication, service or response error; 500 unexpected internal error. An unsuccessful Claude request does not create a snapshot. A failed snapshot or restore attempts to remove its incomplete newly created directory.

## Verification status

The automated tests exercise real Git and filesystem capture/restore while substituting a simulated Claude response; they do not establish that a live Claude request succeeds. The walkthrough commands were exercised against a real local server and Git project, with a simulated Claude response for create. Live Claude access and the complete real-key walkthrough have not been verified here. Model access, account permissions, network and available credits must be checked by the operator.
