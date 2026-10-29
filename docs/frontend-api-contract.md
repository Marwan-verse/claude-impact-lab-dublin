# Person 1 frontend API handoff

Person 2 owns the local service. The frontend currently proxies `/api` to `http://localhost:3001` during development. These shapes are proposed for integration and must be checked jointly against the real service before claiming end-to-end functionality.

| Method and path | Request | Expected response |
| --- | --- | --- |
| `POST /api/inspect` | `{ path }` | Inspection JSON with `inspectionId`, evidence and exclusions. |
| `POST /api/handover/preview` | `{ inspectionId, goal, issue, nextStep }` | `{ previewId, provider, context }`, with `context` the exact serialized material to be sent. No model call. |
| `POST /api/handover/generate` | `{ previewId }` | `{ handover }` or `{ draft }`, a generated string. Only send the reviewed preview. |
| `POST /api/vaults` | `{ inspectionId, handover }` | `{ id, name, createdAt, handover, nextStep }` or `{ vault: {...} }`. |
| `GET /api/vaults` | — | Array of vaults or `{ vaults: [...] }`. |
| `GET /api/vaults/:id` | — | A vault object or `{ vault: {...} }`. |
| `POST /api/vaults/:id/verify` | — | JSON verification results. |
| `POST /api/vaults/:id/restore` | `{ destination }` | JSON result describing actual restoration. |

Use HTTP error statuses and `{ error: "..." }` for failures. The frontend displays inspection and result details as evidence; the backend must avoid including secrets and distinguish facts from inference. Saved handovers are read-only until an update endpoint is defined. Agree a persisted edit contract with Person 2 before claiming this workflow is complete.

The backend must inspect and restore real files safely, reject existing destinations, avoid path/symlink escapes, and accurately disclose exclusions. Successful manifest verification only establishes snapshot integrity, not a working restored environment.

## Integration gaps to resolve with Person 2

- Agree structured inspection data for checked Git facts, included/excluded files, user notes, and exact context. The frontend displays the service's preview and requires confirmation, but a real backend must enforce that the generated request matches the reviewed payload.
- Define capture timing and how a user can edit and persist a saved handover. The generated draft is editable before initial save; saved handovers are read-only.
- Define verification and restore result schemas, including explicit success/failure, details, and what remains unverified. The UI reports explicit `ok`, `success`, or `verified` false values as problems; other structures still need joint agreement.
- Bind the local service to loopback, validate browser origins, protect local paths and symlinks, and never overwrite existing restore destinations. These are backend requirements, not verified properties of this frontend.
- Test the complete workflow against real Git projects and the real service; a temporary UI test fixture does not prove filesystem recovery or Claude integration.

## Proposed next contract: preview, generate, review, save

This is an integration proposal, not an implemented backend API. The frontend now uses these proposed preview, generate, and save steps; agree and verify the schema with Person 2. It separates inspection and outbound AI use so the frontend can show precisely what the service intends to send.

1. `POST /api/inspect` with `{ path }` returns an inspection ID, checked facts (branch, commit, changed files, setup evidence), included paths, exclusions, and warnings. Keep factual evidence distinct from user notes.
2. `POST /api/handover/preview` with `{ inspectionId, goal, issue, nextStep }` returns `{ previewId, provider, context }`, where `context` is the exact serialised material the service will send. It performs no model call. It must exclude credentials and source contents by default. The frontend presents that material for review.
3. `POST /api/handover/generate` with `{ previewId }` sends only the reviewed preview and returns the generated draft. Bind the preview to an immutable inspection/version and the exact context; expire or invalidate it if inputs or source files change. Reject a missing, expired, or changed preview rather than silently changing its contents.
4. The frontend labels the generated draft as AI interpretation and allows the user to edit it. `POST /api/vaults` accepts the inspection ID and edited handover, creates the snapshot, verifies it, and returns the saved vault. Check that source files still match the reviewed inspection; if not, reject and require a fresh inspection. The service reports any failure without a success-like response.
5. Define an update endpoint for later handover edits. Until it exists, saved handovers remain read-only.

Verification responses should state `{ ok, checkedFiles, problems }`; restoration should state `{ ok, destination, restoredFiles, warnings }`. These example fields need agreement and validation. The browser must render checked facts, user notes, and AI text in separate sections and show raw details only as an optional inspection view. A successful integrity check must not be shown as proof the application or its environment runs.
