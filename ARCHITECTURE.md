# 🏛️ NudgeBot Architecture — Dual-Repo Persistence

NudgeBot uses a unique **Dual-Repo** strategy to ensure 100% persistence without requiring local disks or native databases.

## 1. The Memory Repository (`GITHUB_MEMORY_REPO`)
This repository acts as the **Long-Term Memory** and **State Store** for NudgeBot.

- **What is stored**:
  - `store/db.json`: Unified database (Users, Settings, Notifications).
  - `users/{id}/context.json`: Compressed conversation history and key decisions.
  - `notes/*.md`: Persistent notes saved by the agent.
- **Why**: Ensures that even if the server restarts (e.g., on Render's ephemeral tier), NudgeBot remembers who you are, your API keys, and our previous conversations.

## 2. The Workspace Repository (`GITHUB_WORKSPACE_REPO`)
This repository acts as the **Production Environment** and **Project Store**.

- **What is stored**:
  - Source code created by the agent (HTML, JS, Python, etc.).
  - Config files and project assets.
- **Why**: Local files in `./workspace` are lost on restart. By syncing to this repo, your coding projects are versioned and permanent.

---

## 🔄 The Sync Workflow

1. **Local Work**: The agent creates and modifies files in a local `./workspace` folder for speed and to allow running shell commands (npm install, etc.).
2. **Persistence**: The agent uses the `sync_to_workspace` tool to push stable versions of the code to the GitHub Workspace Repo.
3. **Recovery**: On a new session, the agent can `read_file` from the local workspace (if session is active) or pull/explore the GitHub repo if it's a fresh start.

## 🔐 Environment Variables

| Variable | Usage |
|---|---|
| `GITHUB_TOKEN` | Master Personal Access Token (PAT) with `repo` scope. |
| `GITHUB_MEMORY_REPO` | `owner/repo-name` for memory (auto-created if blank). |
| `GITHUB_WORKSPACE_REPO` | `owner/repo-name` for workspace/projects. |

---

## 🚀 Benefits of this Architecture
- **Zero Cost**: Use free GitHub private repos instead of paid cloud databases or disks.
- **Versioned**: Every change to your settings or code is a Git commit.
- **Stateless Server**: Turn off the server anytime; your bot's brain lives in the cloud.
