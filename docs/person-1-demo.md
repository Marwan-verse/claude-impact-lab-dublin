# Frontend demonstration

The React/Vite interface is integrated with the local Node backend for Git inspection, handover generation, snapshot verification and restore. A real browser has exercised the integrated flow with a simulated model response. **Live verification (29 October 2026):** with a real TensorX key and model `deepseek/deepseek-v4.1-flash`, both the direct API flow and the UI's endpoint sequence (inspect, preview, generate, save, verify, restore) completed against real Git projects created by `scripts/make-demo-project.sh`: restored files matched byte for byte, `.env` was excluded and the original project was unchanged. Live Anthropic access and a real-key run clicked through in the browser have not been verified.

## Walkthrough

1. From the repository root, run `npm ci`, `npm run build`, and `npm --prefix backend test`. Configure Anthropic (default) or TensorX and start the backend; in a second terminal run `npm run dev` and open the printed local URL. Live generation may incur charges; TensorX may bill separately, so do not assume Anthropic credits apply. The event requires Claude Code; confirm alternative-model eligibility with the organiser. Follow the [README](../README.md) for hidden TensorX key entry and the [backend guide](backend-api.md) for settings.
2. Choose **Put work away** and enter the absolute path of a real Git repository containing unfinished changes. The [backend guide](backend-api.md#reproducible-unfinished-project-and-api-flow) provides a reproducible example. Do not use a sensitive project without reviewing what will be captured and shared.
3. Inspect the project and review Git state, capture paths, skipped files and exclusions. Enter the optional goal, issue and next step.
4. Prepare and review the exact context preview and its provider, explicitly confirm it, then generate and review the handover. Edit the draft if needed before saving the vault. Separate checked facts, user notes and AI interpretation; the handover is not proof.
5. Open the saved work, optionally edit and save the handover, and check snapshot integrity. Restore to a **nonexistent** absolute destination with an existing safe parent, outside the source and vault; an already-existing empty directory is rejected.
6. Compare restored files against the original. Explain that verification checks snapshot integrity, not that the app works. Git history and staging, dependencies, secrets, environment variables, empty directories and running processes are not restored. The original files remain in place; no agents are stopped.

## Failure and verification

If the backend or selected provider is unavailable, show the actual error; do not substitute canned results for a successful capture or live integration. The integrated browser exercise and API/filesystem tests used a simulated Claude response. Live access to either provider, account permissions, network and available credits must still be checked by an authorised operator before claiming the full real-key flow works.

Before presenting, check visible actions against the current code, keyboard focus, form labels, errors, small-screen layouts and reduced-motion behavior. Review what is sent and captured, and ensure the README reflects the current behavior and limitations. Keep the repository private unless the user explicitly authorises changing visibility; submission also requires their instruction.
