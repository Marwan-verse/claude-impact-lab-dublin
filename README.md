# Dublin Claude Code Impact Lab

Private preparation repository for Kevin Collins's Claude Code Impact Lab, hosted with DCU on **29 October 2026**.

## Confirmed challenge: compression burnout

AI speeds up tasks, but people take on more work and lose breaks and evenings. Build something that returns time or attention to people. Six suggested directions cover workload tracking, understanding checks before accepting changes, a shutdown command, accounting for saved time, recovery between hard support calls, and learning AI together. An explained original approach is also allowed.

**Build 17:30-20:30 Dublin time. Submission closes 20:30 sharp.** This replaces the earlier approximate 20:00 demo assumption.

| Judging | Weight |
| --- | --- |
| Addresses compression burnout for a clear audience | 30% |
| Works end to end, with real functionality | 30% |
| Useful afterward and understandable from the README | 20% |
| Returns time without adding work, alerts, or prompts | 20% |

**Claude is the judge:** the organiser's Clawd agent, described as running on Claude Opus 5.5, evaluates the README and code or live site together with the submission description. Kevin reviews its top-three picks. The project must explain its purpose, setup, real functionality, and time returned clearly without relying on a spoken walkthrough. [Judging setup](https://claude.echofold.ai/#/10)

## Documents

- [Detailed Unfinished Work Vault plan and two-person workload](docs/vault-plan.md)
- [Agent instructions and internal schedule](AGENTS.md)
- [Confirmed brief and product decision](docs/brief.md)
- [Research, deck findings, credits, and submission details](docs/research.md)
- [Official build directions](https://claude.echofold.ai/#/13)
- [Submission form](https://claude.echofold.ai/#/16)
- [Original event listing](https://luma.com/claude-pa54)

## Submission and access

One GitHub repo or accessible live-site link per team. Repo submissions must be public for the judging agent. **This repo remains private at the user's request**; changing visibility needs their instruction. A working accessible live site is an alternative. The form asks for team/project names, link, description, and each member's name and Claude-account email. Keep personal submission data out of tracked files.

## Before building

- Have Claude Code working and bring a charger.
- Claim the $100 API credits once with a Claude Console organisation ID, not a Claude.ai ID. Use slide 12; do not store the redemption link here.
- Choose one narrow workflow and complete `docs/brief.md`.
- Reserve time to verify clean startup, judge access, and successful submission before closure.

## The Unfinished Work Vault

For developers who need to stop with unfinished AI-assisted work, the Vault is intended to reduce the effort of picking it up again: inspect a local Git project, capture its working files, generate a handover, then verify and restore the snapshot to a new folder. The intended time returned is time away from work and less context reconstruction, not a measured productivity claim.

**Status:** the local Node backend is implemented; the planned React/Vite/TypeScript UI is not yet available. The API and filesystem workflow are covered by automated tests using a simulated Claude response; a live Claude request has not been verified. ECC 2.2.3 is installed in the user's Claude Code and Codex environments, but is not a product feature.

### Run the backend

Requires Node.js 20+, npm and Git; the walkthrough also uses curl and jq. No npm dependencies are declared. From the repository root:

```sh
npm --prefix backend test
# Set ANTHROPIC_API_KEY securely in the server environment before creating a vault.
npm --prefix backend start
```

The API listens on `127.0.0.1:3001` by default and is unauthenticated; run it only on a trusted machine. A key is required for creation, which calls Claude and may consume paid credits. Optional configuration: `ANTHROPIC_MODEL`, `ANTHROPIC_WORKSPACE_ID`, `VAULT_ROOT` and `PORT`. See the [backend API guide](docs/backend-api.md) for the defaults, a complete reproducible Git example, all endpoint schemas, and recovery commands.

Before creating a vault, **review the inspection's capture and Claude-context previews and your notes, then explicitly consent**. File contents are not sent to Claude by default, but project names, Git paths, setup names and notes can be sensitive. The snapshot and handover are stored locally. Git-ignored untracked files are skipped, but tracked or unignored secrets can still be captured. Capture refuses files with both staged and unstaged changes to avoid silently losing staged work. Repositories with active configured Git clean/process filters or submodules are not supported. Integrity hashes are not signed; restoration does not restore Git history or staging, empty directories, credentials, dependencies, environment variables or running processes, and verification does not establish that an app runs.
