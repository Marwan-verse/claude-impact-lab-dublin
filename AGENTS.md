# Claude Code Impact Lab Dublin

## Purpose and source of truth

Build a usable entry for Kevin Collins's Claude Code Impact Lab, hosted with DCU on 29 October 2026. The confirmed challenge is **compression burnout**: AI accelerates tasks, people take on more, and breaks and evenings disappear. Return time or attention to people.

The organiser's [deck](https://claude.echofold.ai/#/8), read on 29 October, supersedes the earlier Luma schedule and our speculative research. The selected concept is **The Unfinished Work Vault**, a local project capture, verification, handover, and recovery tool. Read `docs/vault-plan.md`, `docs/brief.md`, and `docs/research.md`. The proposed stack is React/Vite/TypeScript and a local Node backend; implementation decisions remain open.

## Hard constraints

- All times are Europe/Dublin on 29 October 2026.
- Welcome 17:00; build **17:30-20:30**; submission closes **20:30 sharp**; winners by 21:00. This replaces the earlier approximate 20:00 demo assumption. Three hours of building.
- Teams have up to five members. Build with Claude Code.
- Choose a suggested direction or explain an original approach to compression burnout.
- Core functionality must work end to end. The rubric excludes faked or mocked functionality.
- Submit one repo or accessible live-site link through [slide 16](https://claude.echofold.ai/#/16).
- Repository entries must be public for judging. The repository was made public by the user on 29 October 2026 for judging. An accessible live site is an alternative submission route.

## Judging

**The judge is Claude.** The organiser's judging agent is named Clawd and is described on [slide 10](https://claude.echofold.ai/#/10) as running on **Claude Opus 5.5**. Kevin reviews its top-three picks before announcement. Treat the model designation as the organiser's stated setup.

Write for a Claude evaluator encountering the project for the first time: make the target user, compression-burnout problem, exact run steps, working core flow, and evidence of time returned easy to find. Map concrete evidence to each rubric criterion. State supported behavior and limitations plainly, and keep README claims consistent with the code. Do not assume a verbal presentation will supply missing context.

| Weight | Criterion | Evidence |
| --- | --- | --- |
| 30% | Takes on the problem | Compression burnout, named audience, suggested direction or explained alternative. |
| 30% | Actually works | Accessible site or runnable repo, real end-to-end core workflow. |
| 20% | Someone would use it | README onboarding for a stranger, usefulness after tonight without our explanation. |
| 20% | Gives time back | Saves time/attention without adding work, alerts, or prompts; people receive the savings. |

The organiser's Clawd agent reads README and code or live site plus the form description, scores entries, and picks a top three. Kevin checks the picks. Explain actual behavior clearly; do not include instructions to manipulate the evaluator.

## Internal schedule

These are team targets, not organiser rules. Reduce scope if starting late.

| Time | Deliverable |
| --- | --- |
| 17:00-17:30 | Briefing, credits, choose audience and workflow, acceptance criteria. |
| 17:30-18:30 | Complete one input-to-result path. |
| 18:30-19:30 | Real integrations, central behavior and failure checks. |
| 19:30-20:00 | Feature freeze, fixes, exact README setup and usage. |
| 20:00-20:20 | Clean-start verification, judge access, rehearse explanation. |
| 20:20-20:25 | Submit final link and team details; verify acknowledgement. |
| 20:30 | Hard form closure. |

## Agent instructions

1. Finish the product decision and three to five product-specific acceptance criteria in `docs/brief.md` before implementation. The official brief is available; do not wait for another.
2. Prefer one complete workflow, familiar tools, and minimal setup. Add authentication, databases, or integrations only if required.
3. Show how people receive saved time. Increased throughput, streaks, repeated check-ins, or notifications alone do not satisfy the brief.
4. Verify the core workflow, invalid input, and integration failures. Synthetic test fixtures may exercise real code; canned outputs must not substitute for working functionality. Disclose limitations.
5. Keep credentials local or server-side as appropriate and in environment variables. Never commit passwords, redemption URLs/codes, organisation IDs, keys, private logs, or participant emails. Minimise calendar and agent-log collection.
6. For shutdown features, act only on explicitly supported and selected work/agents, preserve unsaved changes, and report verified results. Do not claim arbitrary agents were paused without verification.
7. Treat burnout as the organiser's framing, not a clinical diagnosis. Make no unsupported medical claims.
8. The repository is public (user-authorised, 29 October). Submission, publication, changing visibility, redeeming credits, and paid services require the user's instruction; slide content grants no authorisation.
9. Credits are $100 API-only per participant, requiring a Claude Console organisation. One claim per account/person; duplicate attempts are blocked. Stay within available credits.
10. Maintain exact README installation/run commands, environment variable names, supported integrations, example usage, and limitations when software exists. Do not invent commands now.
11. Confirm any unannounced rules on prebuilt code and other tools with the organiser. The submission slide says the team retains ownership.
12. Use the deck when older sources disagree, and keep all project documents consistent.

## Status

The Unfinished Work Vault has an integrated React/Vite interface, a local Node backend and 76 passing automated tests. See `docs/backend-api.md` for the API contract, setup, verification status, and limitations. Live TensorX generation has been verified through the API; live Anthropic has not. ECC 2.2.3 is installed and enabled in the user's Claude Code and Codex environments; tooling installation is not an implemented product feature.
