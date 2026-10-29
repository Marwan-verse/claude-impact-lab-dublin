# Claude Code Impact Lab Dublin

## Project purpose

This repository prepares for, and will hold our team's entry to, Kevin Collins's Dublin Claude Code Impact Lab on 29 October 2026. The product is not selected yet. Build one useful, demonstrable solution to an official brief once the organisers provide it. Read `docs/research.md` for sources and clearly labelled hypotheses.

The event follows the 17 September Claude Conversation: a participatory discussion about AI and work, families and communities, and who sets the rules. Do not present our predicted ideas as official challenges or claim access to the discussion's unpublished outcomes.

## Confirmed event constraints

Source: https://luma.com/claude-pa54 (checked 29 October 2026).

- Doors open 17:00; demos start around 20:00; finish 21:00, Europe/Dublin time. Treat 20:00 as the delivery deadline: roughly three hours, including briefing and food, rather than four hours of coding.
- Teams have up to five people; solo participants can join a team there.
- Pick an organiser-provided brief and build with Claude Code.
- Judging rewards direct problem fit, a working live demo, and practical usefulness afterward.
- Each participant receives $100 in Claude API credits. Redemption requires a Claude Console organisation; a personal Claude.ai account is insufficient.
- Bring a working Claude Code setup, laptop, and charger.

## Proposed build schedule

These are our working targets, not organiser rules. If starting late, shorten scope rather than moving the demo deadline.

| Dublin time | Deliverable |
| --- | --- |
| 17:00-17:15 | Read actual briefs; choose one user, one problem, and one measurable outcome. |
| 17:15-17:30 | Write acceptance criteria, sketch the main flow, select familiar tools. |
| 17:30-18:30 | Implement a complete input-to-result path and run it locally. |
| 18:30-19:15 | Test the real integration; improve the core output and error handling. |
| 19:15-19:40 | Freeze features; fix failures; prepare a clearly labelled sample-data fallback. |
| 19:40-20:00 | Rehearse a short live demo; verify startup and document handover. |

## Agent operating instructions

1. Before implementation, record the official brief, target user, chosen solution, and three to five acceptance criteria in `docs/brief.md`. The official brief overrides hypotheses in the research notes.
2. Until a brief is available, focus on research and setup. Do not commit the project to a speculative product or framework.
3. Prefer one complete workflow over multiple partial features. Use a familiar stack with minimal setup. Add a database, authentication, or external integration only when the selected workflow requires it.
4. Keep Claude credentials server-side and in environment variables. Never commit keys, redemption codes, private participant information, or real children's data. Use synthetic examples for demos.
5. Verify the central workflow, invalid input, and API failure behavior. Label cached or synthetic fallback outputs so the demo does not imply a successful live call.
6. Keep generated claims reviewable. If the selected product makes factual claims, show supporting sources or uncertainty. Do not promise reliable AI detection, job-loss prediction, or legal compliance from a short prototype.
7. Confirm event guidance on prebuilt code, permitted tools, and submission requirements on arrival. Preparation here does not establish permission to reuse implementation code.
8. Keep the repository private. Do not publish the project, change visibility, spend beyond available credits, or add paid services without the user's instruction.
9. Update the README with exact run commands, required environment variable names, what works, and known limitations when implementation exists.
10. Prepare a short demo: named problem, affected user, live workflow, useful result, and one honest limitation. Stop adding features before the rehearsal window.

## Current status

Research and planning only. No application, dependencies, selected stack, or run command exists yet. The official brief and final submission format remain unconfirmed.
