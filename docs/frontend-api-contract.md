# Person 1 frontend API handoff

Person 2 owns the local service. The frontend currently proxies `/api` to `http://localhost:3001` during development. These shapes are proposed for integration and must be checked jointly against the real service before claiming end-to-end functionality.

| Method and path | Request | Expected response |
| --- | --- | --- |
| `POST /api/inspect` | `{ path }` | Inspection JSON displayed to the user, including evidence and exclusions. |
| `POST /api/vaults` | `{ path, goal, issue, nextStep }` | `{ id, name, createdAt, handover, nextStep }` or `{ vault: {...} }`. |
| `GET /api/vaults` | — | Array of vaults or `{ vaults: [...] }`. |
| `GET /api/vaults/:id` | — | A vault object or `{ vault: {...} }`. |
| `POST /api/vaults/:id/verify` | — | JSON verification results. |
| `POST /api/vaults/:id/restore` | `{ destination }` | JSON result describing actual restoration. |

Use HTTP error statuses and `{ error: "..." }` for failures. The frontend displays inspection and result JSON as evidence; the backend must avoid including secrets and distinguish facts from inference. The save-handover endpoint is not yet defined: editing in the UI is local-only and must not be represented as persisted. Agree a persisted edit contract with Person 2 before claiming this workflow is complete.

The backend must inspect and restore real files safely, reject existing destinations, avoid path/symlink escapes, and accurately disclose exclusions. Successful manifest verification only establishes snapshot integrity, not a working restored environment.

## Integration gaps to resolve with Person 2

- Define structured inspection data for checked Git facts, included/excluded files, user notes, and the exact selected context that would be sent to Claude. The current JSON display cannot guarantee that the preview matches the payload.
- Add an explicit review/consent step tied to that exact Claude-bound payload before the backend sends it; a generic configuration reminder is not a substitute.
- Define whether capture happens before or after handover review, and how a user can edit and persist the handover. Current edits are temporary and navigating away discards them.
- Define verification and restore result schemas, including explicit success/failure, details, and what remains unverified. The UI reports explicit `ok`, `success`, or `verified` false values as problems; other structures still need joint agreement.
- Bind the local service to loopback, validate browser origins, protect local paths and symlinks, and never overwrite existing restore destinations. These are backend requirements, not verified properties of this frontend.
- Test the complete workflow against real Git projects and the real service; a temporary UI test fixture does not prove filesystem recovery or Claude integration.
