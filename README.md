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

## Development status

The `person-1` branch contains the React/Vite interface for **The Unfinished Work Vault**. It calls the proposed local service but does not implement snapshot capture, Claude, verification, or restoration; those are Person 2's work. Handover edits currently last only while the view is open.

To run the frontend, install Node.js and run `npm install`, then `npm run dev`. Open the local URL printed by Vite. `npm run build` checks the production bundle. Development requests under `/api` proxy to a local service on port 3001; without that service, the interface displays an unavailable message. See [the proposed API contract](docs/frontend-api-contract.md) and [demo instructions](docs/person-1-demo.md).
