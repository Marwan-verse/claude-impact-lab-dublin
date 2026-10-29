# Confirmed brief and product decision

Status: **Official challenge confirmed; team product not selected.**

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

## Product decision: complete before coding

- Target user: pending.
- Selected direction/product name: pending.
- Concrete situation and problem: pending.
- Single input-to-result workflow: pending.
- How the person receives time/attention back: pending.
- How the flow avoids extra work/interruptions: pending.
- Real integrations, access, and supported scope: pending.
- Stack and reason: pending.
- Excluded features: pending.
- Verification example: pending.
- Submission route: public repo only with user authorisation, or accessible live site.

The shutdown command is a recommendation because it provides a narrow workflow and protects an evening. It is not a selected product. Saving work and pausing agents must be implemented and verified for supported tools, not just described in generated text.

## Acceptance criteria

Make these product-specific when selecting the workflow:

- [ ] A named target user completes the real core workflow end to end.
- [ ] The result demonstrably returns time or attention.
- [ ] No unnecessary alerts, prompts, repeated entry, or new tasks.
- [ ] A stranger can start from the README, with clear failure behavior and limitations.
- [ ] The final link is judge-accessible and submission succeeds before 20:30.

## Delivery

Build 17:30-20:30 on 29 October 2026, Europe/Dublin. Target submission by 20:25. Weights: problem fit 30, working implementation 30, usability afterward 20, time returned 20. No mocked or faked core functionality; sample fixtures must exercise the actual implementation. Judge reads README/code or live site and form description; Kevin checks the top three.
