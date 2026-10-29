# Confirmed brief and product decision

Status: **Official challenge confirmed; The Unfinished Work Vault implemented.**

Sources read 29 October 2026: [problem](https://claude.echofold.ai/#/8), [directions](https://claude.echofold.ai/#/13), [rubric](https://claude.echofold.ai/#/14).

## Official problem

**Compression burnout:** faster AI-assisted tasks lead to greater workload, consuming breaks and evenings. Ease this load and return time or attention to people. Increased throughput alone does not meet the purpose. The organiser selected this problem from the September discussion; our earlier work/family/governance predictions are superseded.

## Six suggested directions

| Audience | Direction | Intended behavior |
| --- | --- | --- |
| Individuals | Workload tracker | Reveal workload and time since a break from calendar, git history, or Claude Code logs. |
| Individuals | Check before accepting | A Claude Code hook asks for a one-line explanation before accepting a big change. |
| Individuals | Shutdown command | Save open work, prepare tomorrow's list, and pause agents overnight. |
| Teams | Saved-time tracker | Show whether AI time savings became more work or time returned to people. |
| Helplines/charities | Hard-call support | Pace difficult calls and allow recovery when AI handles easier calls. |
| Dublin community | Learning AI together | Learn one useful thing each week as a group instead of keeping up alone. |

Original ideas are allowed if they explain their fit. Minimise interruption cost even for suggested ideas: the rubric also penalises added prompts and work.

## Product decision

- Target user: a developer ending a Claude Code session with unfinished work.
- Product: The Unfinished Work Vault; an original idea addressing compression burnout.
- Problem: incomplete work and lost context make it hard to stop or restart confidently.
- Workflow: discover a recent local Codex/Claude Code Git project or enter one manually; inspect it, capture permitted files and context, create a handover, verify the snapshot, and restore to a new folder.
- Time back: reduce end-of-day handover and next-session context recovery without recurring alerts.
- Integrations: local Git, local storage, and selectable Anthropic (default) or TensorX handover provider. Live TensorX generation has been verified; live Anthropic access has not. TensorX may bill separately; do not assume Anthropic credits apply.
- Stack: React/Vite interface and local Node backend. The event allows any handover model (confirmed 29 October 2026); the product is built with Claude Code and the organiser's Claude judge is unchanged.
- Exclusions: arbitrary agent pausing, cloud/database recovery, automatic transcript capture, and team sync.
- Verification example: save a real half-built project, check its snapshot, restore into a new folder, and compare actual files.
- Submission route: public repo only with user authorisation, or accessible live site.

See [the detailed product plan](vault-plan.md) for the interface, architecture, two-person division, and delivery schedule. Snapshot verification must not be described as verification that the whole application or development environment runs.

## Acceptance criteria

Product-specific acceptance criteria:

- [x] Capture a real local Git project, its state, and permitted files.
- [x] Generate an editable handover distinguishing evidence, user notes, and inference.
- [x] Verify snapshot integrity and restore files to a new folder without altering the original.
- [x] Clearly disclose exclusions and unverified setup; a stranger can start from the README.
- [ ] The final link is judge-accessible and submission succeeds before 20:30.

## Delivery

**Evaluator: Claude**, through the organiser's Clawd judging agent (stated model: Claude Opus 5.5). Kevin reviews the top three. Make the final README and submission self-contained: identify the audience, show the working workflow, provide exact startup steps, and give concrete evidence against the four criteria. Match every claim to implemented behavior.

Build 17:30-20:30 on 29 October 2026, Europe/Dublin. Target submission by 20:25. Weights: problem fit 30, working implementation 30, usability afterward 20, time returned 20. No mocked or faked core functionality; sample fixtures must exercise the actual implementation. Judge reads README/code or live site and form description; Kevin checks the top three.

The current app also provides project status, an explicitly reviewed multi-project end-of-day queue, a recovery workspace, snapshot comparisons, a decision journal, a context map, and locally exported and reviewed teammate handoffs. See the README for limits.
