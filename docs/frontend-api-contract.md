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
