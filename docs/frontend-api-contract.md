# Frontend and backend API contract

The React/Vite UI and the local Node service are integrated. This describes the implemented browser flow; see [backend-api.md](backend-api.md) for the complete API, setup, privacy safeguards and limitations.

## Local setup

From the repository root, follow the README: `npm ci`, `npm run build`, and `npm --prefix backend test`. Configure the backend provider and start it; run `npm run dev` in a second terminal. Anthropic is the default and uses `ANTHROPIC_API_KEY`; TensorX requires `HANDOVER_PROVIDER=tensorx`, `TENSORX_API_KEY`, and `TENSORX_MODEL`. See the [README](../README.md#optional-tensorx-provider-hidden-key-entry) for hidden key entry and model selection. Real generation makes a provider request and may incur charges; TensorX may bill separately and Anthropic credits cannot be assumed to apply. The event allows any handover model (confirmed 29 October 2026); the product is built with Claude Code and the organiser's Claude judge is unchanged. The API binds to `127.0.0.1:3001` by default, without authentication; use a trusted machine. Vite proxies `/api` to `http://127.0.0.1:3001`; changing backend `PORT` also requires changing that proxy for the UI. Other settings and path constraints are documented in the backend guide.

## Browser flow

All POST requests below use JSON, and failures return a non-success HTTP status and `{error: "..."}`. The service checks the reviewed project context and capture preview for changes; avoid concurrent project or vault changes because these checks are not race-proof.

| Step | Request | Actual response and behavior |
| --- | --- | --- |
| Inspect | `POST /api/inspect` with `{path}` | Inspection including `inspectionId`, Git facts, exclusions, `capturePreview`, and `contextPreview`. Review the files and skipped paths. |
| Preview | `POST /api/handover/preview` with `{inspectionId, goal, issue, nextStep}` | `{previewId, provider, context}`; `provider` identifies the configured provider and `context` is the exact serialized user-message material intended for it. No model call occurs. Notes may be empty strings. |
| Generate | `POST /api/handover/generate` with `{previewId}` | `{handover}` after the user reviews and confirms the preview. The preview is single-use, including on failure; prepare a new one if generation fails. |
| Review and save | `POST /api/vaults` with `{inspectionId, handover}` | 201 with the saved record including `id`; the generated draft can be edited before saving. The service captures the snapshot after generation and rejects changed inspections; saving does not call the model again. |
| List and open | `GET /api/vaults`; `GET /api/vaults/:id` | An array of records, then a detailed record including `manifest`, checked facts and user notes. |
| Check | `POST /api/vaults/:id/verify` with `{}` | `{ok, issues, checkedFiles}`; `ok: false` is still HTTP 200 and indicates an integrity problem. |
| Restore | `POST /api/vaults/:id/restore` with `{destination}` | `{destination, restoredFiles, limitations, handover}`. The absolute destination must not exist; its safe parent must already exist and the destination must be outside the source and vault. Existing empty folders are rejected too. |

The browser can edit a saved handover using `PATCH /api/vaults/:id` with `{handover: string}`. Unsaved edits are guarded before leaving. If initial capture fails after generation, the draft remains visible for copying before a fresh inspection and confirmed preview. The API also supports a separate direct create flow; it is not the browser sequence above.

Inspection and preview IDs are in memory, expire after 15 minutes and do not survive a server restart. A new preview invalidates the previous draft. The UI displays the provider and exact context and requires confirmation; the service rechecks the inspected state before and after generation and before saving. Source file contents and capture hashes are not sent to the selected provider by default, but notes, names and paths can be sensitive. Snapshot contents remain local and may include tracked or unignored secrets; review the capture preview. Verification checks snapshot integrity, not whether the application or its environment runs. Restore does not recreate Git history or staging, dependencies, credentials, environment variables, empty directories, or running processes.

## Evidence and outstanding verification

The integrated UI has been exercised in a real browser with the local backend and a simulated model response. **Live verification (29 October 2026):** with a real TensorX key and model `deepseek/deepseek-v4.1-flash`, both the direct API flow and the UI's endpoint sequence (inspect, preview, generate, save, verify, restore) completed against real Git projects created by `scripts/make-demo-project.sh`: restored files matched byte for byte, `.env` was excluded and the original project was unchanged. Live Anthropic access and a real-key run clicked through in the browser have not been verified.
