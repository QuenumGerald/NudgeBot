# 🏛️ NudgeBot Architecture — Unified GitHub Persistence

NudgeBot uses a single GitHub repository configured with `GITHUB_MEMORY_REPO` to persist long-term memory, state, notes, and agent-generated workspace files without relying on local disks.

## The Memory Repository (`GITHUB_MEMORY_REPO`)

Set `GITHUB_MEMORY_REPO` to an `owner/repo-name` value such as `xxxxxxx/nudgebot-memory`. If the variable is blank, NudgeBot resolves the owner from the configured GitHub token and auto-creates a `nudgebot-memory` repository.

- **What is stored**:
  - `store/db.json`: Unified database (Users, Settings, Notifications).
  - `users/{id}/context.json`: Compressed conversation history and key decisions.
  - `notes/*.md`: Persistent notes saved by the agent through `save_note`.
  - `workspace/**`: Files synced by the agent through `sync_to_workspace`.
- **Why**: Ensures that even if the server restarts (e.g., on Render's ephemeral tier), NudgeBot remembers who you are, your API keys, previous conversations, notes, and project files.

---

## 🔄 The Sync Workflow

1. **Local Work**: The agent creates and modifies files in a local `./workspace` folder for speed and to allow running shell commands (npm install, etc.).
2. **Notes**: The agent uses `save_note` to write Markdown notes into `/notes/` in the memory repository.
3. **Workspace Persistence**: The agent uses `sync_to_workspace` to push stable file versions into `/workspace/` in the same memory repository.
4. **Recovery**: On a new session, the agent can `read_file` from the local workspace (if session is active) or pull/explore the GitHub memory repository if it's a fresh start.

## 🔐 Environment Variables

| Variable | Usage |
|---|---|
| `GITHUB_TOKEN` | Master Personal Access Token (PAT) with `repo` scope. |
| `GITHUB_MEMORY_REPO` | `owner/repo-name` for memory, notes, and workspace files. Defaults to auto-created `nudgebot-memory` when blank. |

---

## 🚀 Benefits of this Architecture
- **Zero Cost**: Use a free GitHub private repo instead of paid cloud databases or disks.
- **Versioned**: Every change to your settings, notes, or code is a Git commit.
- **Stateless Server**: Turn off the server anytime; your bot's brain and workspace live in the cloud.
