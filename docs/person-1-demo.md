# Person 1: frontend and demonstration

The interface supports the planned local Git project capture, handover, snapshot verification, and restore workflow. Person 2 owns the local backend, filesystem operations, Git inspection, and Claude integration; this branch does not imply those services are already implemented.

## Walkthrough once the backend is integrated

1. Start the local backend and frontend using their documented commands.
2. Open a real Git project containing unfinished changes. Choose **Put work away** and enter its local path.
3. Inspect the project. Review the returned Git state and exclusions. Enter the goal, issue, and next step.
4. Prepare and review the exact context preview, confirm it, generate an editable handover, and save. Explain which information is user-provided, checked, and generated.
5. Open the saved experiment, check snapshot integrity, and restore into a new, empty destination.
6. Compare restored files against the original. Explain that verified snapshot integrity is not proof that dependencies, secrets, cloud services, or the application itself have been restored.

## Demo fallback

If the backend or Claude service is unavailable, show the actual unavailable state and explain that capture and restore require Person 2's service. Do not present canned responses as a working product or claim a capture succeeded.

## Checks before handoff

- Review keyboard focus, form labels, error messages, small-screen layouts, and reduced-motion behavior.
- Check that the user sees the context supplied to Claude before submission and can distinguish checked state from AI output.
- Verify all visible actions against the agreed backend contract and actual integration.
- Ensure the README describes current setup, dependencies, limitations, and user-facing behavior without promising unimplemented functions.

## Frontend fixture check

The capture, exact context preview, confirmation, and generated draft screens were exercised against a temporary local HTTP fixture. The unsaved-draft dialog was checked for both keeping the edited draft and confirming discard. The fixture supplied synthetic responses and did not inspect or restore files or call Claude. It was removed after the test. Repeat the entire walkthrough against Person 2's real service before presenting the workflow as working end to end.
