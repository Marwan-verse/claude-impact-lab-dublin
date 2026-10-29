# Automatic project discovery

The Vault automatically lists recent Git projects found in local **Codex** and **Claude Code** session metadata when the dashboard opens. Select **Review project** to prefill its path, then use the normal inspection and consent flow. Refresh the list without restarting either tool.

Discovery is a list of candidates, not an archive. No project files are copied and no model request is made merely by discovery. The user still reviews capture paths and provider context, confirms the model request, edits the handover, and chooses to save. Saved vaults and discovered projects appear separately.

## How it works

- The backend examines session JSONL under `CODEX_HOME/sessions` (default `~/.codex/sessions`) and `CLAUDE_CONFIG_DIR/projects` (default `~/.claude/projects`). It uses working-directory metadata and file modification time; it never returns conversation text. Bounded file prefixes may include other session content, but it is not exposed by this feature or sent to a model.
- It finds an existing ancestor with a `.git` directory or worktree `.git` file, merges duplicates, and orders candidates by session-file modification time. It does not run Git during discovery. Subsequent inspection applies the existing safety, Git, path, and capture checks.
- Each source examines at most 10,000 session-file entries, considers up to 200 of those files, and traverses at most 1,000 directories; each file read is capped at 256 KiB / 100 records. Invalid records, deleted paths, non-Git projects, inaccessible files, older history, and remote-only environments may be missed. A source that cannot be traversed reports a warning. Dates indicate file modification time, not proof of an active task.
- Candidates refresh on dashboard load and via **Refresh**. This does not install hooks, watch sessions in the background, sync between devices, or automatically save snapshots.
- The unauthenticated local backend returns project paths to the UI. Run it only on a trusted machine. Paths can reveal private information.

The reusable skill source is [`skills/unfinished-work-vault/SKILL.md`](../skills/unfinished-work-vault/SKILL.md). Install it under `~/.codex/skills/unfinished-work-vault` for Codex or `~/.claude/skills/unfinished-work-vault` for Claude Code, then start a new session. The skill guides review and recovery; discovery works independently of skill invocation.
