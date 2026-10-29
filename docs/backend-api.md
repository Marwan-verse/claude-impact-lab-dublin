# Backend API and local walkthrough

The local Node HTTP API is integrated with the React/Vite UI. It inspects a Git working tree, sends explicitly confirmed metadata and notes to the configured AI provider for a handover, snapshots permitted files locally, and verifies/restores those files. It does not stop agents or recreate a working environment. The intended benefit is less time reconstructing context when you return, not a measured time saving.

## Requirements and configuration

- Node.js 20 or newer, npm and Git. The walkthrough also uses `curl` 7.76.0 or newer (`--fail-with-body`) and `jq`, and assumes a POSIX shell.
- The backend declares no npm dependencies. For the app, follow the README: run `npm ci`, `npm run build`, and `npm --prefix backend test` from the repository root; then start the backend with `npm --prefix backend start` and the frontend in a second terminal with `npm run dev`.
- `HANDOVER_PROVIDER` selects `anthropic` (default) or `tensorx`. Anthropic generation requires `ANTHROPIC_API_KEY`; optional `ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`, and `ANTHROPIC_WORKSPACE_ID` sets the `anthropic-workspace-id` header. TensorX generation requires both `TENSORX_API_KEY` and an exact available `TENSORX_MODEL` ID. Set secrets in the server's environment, never a tracked file; other API operations do not require a key. The [README's hidden-entry steps](../README.md#optional-tensorx-provider-hidden-key-entry) show safe model discovery and startup.
- A real generation makes a network request and may incur charges. TensorX may bill separately; do not assume the event's Anthropic credits apply. The event requires building with Claude Code; confirm alternative-model eligibility with the organiser. The organiser's Claude judge is unchanged.
- Shared optional settings: `VAULT_ROOT` (default `~/.unfinished-work-vault`) and `PORT` (default `3001`; 1–65535). Relative `VAULT_ROOT` values are resolved by the server. Project, vault and destination paths must avoid symlink components; project and vault must not contain one another.
- The server binds to `127.0.0.1` and has **no authentication**. Other local users/processes can call it. Host and browser Origin checks are not authentication; do not expose it to a network or use it on an untrusted shared machine. Allowed cross-origin browser origins are `http://localhost:5173` and `http://127.0.0.1:5173`.
- Vite's development proxy forwards `/api` to `http://127.0.0.1:3001` regardless of `PORT`. If changing the backend port, update the proxy target as well; changing `PORT` alone only works for clients that address the backend directly.

## What is shared and stored

Inspection is local and returns `capturePreview` (file paths, SHA-256 hashes, and skipped paths) and `contextPreview` (project name, branch, commit, Git status paths, exclusion names and setup-file names). **Review both previews and your notes before explicitly confirming.** The direct create flow requires `confirmed: true` and the unchanged `contextPreview` and `capturePreview`; the backend re-inspects both before and after the provider request and rejects changes with 409. The frontend flow separately prepares an exact outbound preview identifying the provider, generates after user confirmation, and saves the reviewed editable handover. Capture checks file hashes during copying. The exact `contextPreview` and notes are sent to the selected provider; source file contents and capture hashes are **not sent by default**. Notes can themselves contain source or secrets, and filenames, branch names, paths and notes may be sensitive. Do not send anything you are not authorised to share. These checks are not race-proof: concurrent changes are unsupported.

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

In **another terminal**, from this repository root, set the same `DEMO` path printed above, configure your own key securely in that shell, and start the server. For TensorX, follow the README's hidden-key and model-selection steps and also `export HANDOVER_PROVIDER=tensorx` in this shell before starting. Replace the example path; do not paste your key into the repository or a shared terminal recording. Leave the server running for the remaining steps. To change ports, set `PORT` here and change `BASE` below accordingly.

```sh
DEMO='/absolute/path/printed/above'
# Configure the selected provider in this shell first; see the README.
VAULT_ROOT="$DEMO/vault" npm --prefix backend start
```

Back in the first shell, inspect and review **all** output, including filenames and skipped files. The next step sends `contextPreview` and notes to the configured provider only after your consent. No source file contents are sent automatically.

```sh
BASE='http://127.0.0.1:3001'
jq -n --arg projectPath "$DEMO/project" '{projectPath: $projectPath}' |
  curl --fail-with-body -sS -H 'Content-Type: application/json' --data-binary @- "$BASE/api/inspect" > "$DEMO/inspection.json"
jq . "$DEMO/inspection.json"
```

After reviewing and explicitly consenting to share that context and the following notes, create the vault. If the project changes, inspect and review again. A real API key and a working connection to the selected provider are needed here.

```sh
jq -n --arg projectPath "$DEMO/project" \
  --arg notes 'Goal: finish the implementation. Issue: API error. Next: investigate the response.' \
  --slurpfile inspection "$DEMO/inspection.json" \
  '{projectPath: $projectPath, notes: $notes, confirmed: true, context: $inspection[0].contextPreview, capturePreview: $inspection[0].capturePreview}' |
  curl --fail-with-body -sS -H 'Content-Type: application/json' --data-binary @- "$BASE/api/vaults" > "$DEMO/created.json"
jq . "$DEMO/created.json"
ID=$(jq -er '.id' "$DEMO/created.json")
```

Read the generated handover critically; it is interpretation, not proof. List, read, optionally replace the handover, verify and restore. The example replacement is deliberately labelled as user-edited rather than model output.

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
| `POST /api/handover/preview` | `{inspectionId, goal, issue, nextStep}`; notes are strings and may be empty. | 200: `{previewId, provider, context}`. `provider` identifies the selected provider; `context` is the exact serialized material to be sent; no model call occurs. |
| `POST /api/handover/generate` | `{previewId}` after explicit review and consent. | 200: `{handover}`; each preview is single-use. A failed generation requires a new preview. |
| `POST /api/vaults` | `{projectPath: string, notes: string, confirmed: true, context: object, capturePreview: object}`. Notes may be empty; both previews must exactly match the latest inspection before and after the model call. | 201: metadata `{id, createdAt, projectPath, projectName, git, setupEvidence, exclusions, skipped, notes, handover, limitations, fileCount}`. The provider is called before snapshot creation. |
| `POST /api/vaults` (frontend flow) | `{inspectionId, handover}` after successful generation and review. | 201: saves the edited handover and snapshot without a second model call; rejects stale inspection or capture previews. |
| `GET /api/vaults` | No body. | 200: array of detailed records, newest first; empty array when the vault root does not exist. |
| `GET /api/vaults/:id` | No body. | 200: metadata plus `manifest: {version: 1, files: [{path, size, sha256, mode}]}`. Size is bytes; mode is a numeric permission mask. |
| `PATCH /api/vaults/:id` | `{handover: string}`; empty string permitted. | 200: updated detailed record including manifest. |
| `POST /api/vaults/:id/verify` | `{}`. | 200: `{ok: boolean, issues: string[], checkedFiles: number}`; `ok: false` is still HTTP 200. |
| `POST /api/vaults/:id/restore` | `{destination: string}`: absolute, new path with existing safe parent, outside source and vault. | 200: `{destination, restoredFiles, limitations, handover}`. Integrity failure or existing destination returns 409. |

Frontend inspection and preview IDs are kept in memory, expire after 15 minutes, and do not survive server restart. Preparing another preview invalidates the prior draft. Typical errors: 400 invalid input, path, Git project or manifest; 403 invalid Host/Origin; 404 missing endpoint/path or expired preview; 409 stale context, failed integrity or destination conflict; 413 oversized body; 415 wrong content type; 503 missing provider configuration; 502 provider timeout, network, authentication, service or response error; 500 unexpected internal error. An unsuccessful provider request does not create a snapshot. A failed snapshot or restore attempts to remove its incomplete newly created directory.

## Verification status

The integrated UI has been exercised in a real browser against the local backend with a simulated Claude response. The automated tests exercise real Git and filesystem capture/restore with simulated model responses; they do not establish live access. The API walkthrough commands were exercised against a real local server and Git project, with a simulated Claude response for create. Neither live Anthropic nor live TensorX access, nor the complete real-key walkthrough, has been verified here. Model access, account permissions, network and available credits must be checked by the operator.
