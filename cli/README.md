# DAYA Code

Coding agent in your terminal. Runs on **your** machine, inside **your** project: reads, searches, edits, writes files, and executes real commands. The brain (AI) lives on [DAYA](https://daya-ai.com); you only need a token.

## Installation

```bash
npm install -g daya-code
daya-code login          # one-time: paste your token from daya-ai.com → Settings → API Tokens
```

Without npm it also works: download `daya-code.mjs` from daya-ai.com → Settings → DAYA Code and run it with `node daya-code.mjs`.

## Usage

Run `daya-code` **inside your project folder**: that will be its working scope.

```bash
daya-code "fix the login bug and run the tests"     # one task
daya-code                                             # interactive mode
daya-code --yes "add tests to the payments module"    # no confirmations
daya-code --continue                                  # resume last session in this folder
daya-code --glm "simple task"                         # economical: GLM-5.2 in charge
daya-code --max "complex refactor"                    # maximum quality: frontier on every step
daya-code --duo "something important"                 # on finish, the other model reviews and fixes what fails
```

## Using DAYA in other editors (OpenCode, Cline, Continue, Zed, Aider…)

DAYA exposes an **OpenAI-compatible API**, so your account works inside the tools you already use.

```bash
daya-code opencode      # configures OpenCode with your account, in one step
```

For any other client, the manual setup is always the same:

| Field | Value |
|---|---|
| Base URL | `https://daya-ia-production.up.railway.app/v1` |
| API key | your `dy_...` token |
| Models | By need: `daya` · `daya-max` · `daya-fast` · `daya-code` · `daya-code-pro` · `daya-vision` · `daya-reasoning` · `daya-long`<br>By lab: `daya-deepseek` · `daya-glm` · `daya-minimax` · `daya-qwen` |

Requires Pro plan. Quota is deducted **based on what each call costs**, not per call: a lightweight query counts as 1 message and one that sends half your project costs more, just like choosing `daya-max` instead of `daya`. The `X-Daya-Quota-Cost` header on each response tells you how much it consumed.

> [OpenCode](https://opencode.ai) is an independent project (MIT); DAYA only acts as a model provider. The `opencode` command only writes your `~/.config/opencode/opencode.json` config file (with a backup if it already existed): it does not download or install anything of theirs.

## What it can do

- `read_file` · `edit_file` (space/indentation-tolerant replacement) · `write_file` · `list_dir` · `search_files` (regex across the whole project) · `run_command` · `plan_tasks` (live checklist)
- **Parallel exploration sub-agents**: in large projects, the agent delegates searching to read-only mini-agents that investigate several fronts at once and return reports — faster, cheaper, and with clean context.
- **MCP** (Model Context Protocol): connect external tools (databases, APIs, services) by configuring them in `~/.daya/mcp.json`; the agent uses them as its own. `/mcp` lists connected servers.
- **Vision**: the agent can look at screenshots, mockups, and diagrams (`view_image`) to understand and fix the real UI.
- **Plan mode** (`--plan`): presents a numbered plan and waits for your approval before touching anything. Ideal for large or delicate tasks.
- **Permissions remembered per project**: answer `y` to a confirmation and it won't ask again for that in this project (even across sessions). Manage them with `/permissions`.
- **Undo** (`/undo`): reverts the last file the agent created or modified.
- **Destructive command guard**: `rm -rf`, `git reset --hard`, `push --force`, `sudo`, etc. ALWAYS require explicit confirmation — neither `--yes` nor remembered permissions bypass them.
- **Streaming responses**: the agent's text appears in real-time as it thinks.
- **Persistent sessions per folder**: close the terminal and pick up where you left off with `--continue`.
- Automatically sends project context (OS, structure, package.json, git —remote and status—, available tools and gh CLI state, and your rules in `DAYA.md`/`CLAUDE.md`).
- **Installs dependencies, versions with git, and pushes to GitHub** (creates the repo with `gh` if authenticated), and **creates games and apps** from scratch, verifying them on run.
- Asks for confirmation before writing, editing, or executing (except `--yes`), with a **color diff** of the change; answer `y` to skip confirming the same thing in the session.
- End-of-task summary (files touched, commands, sub-agents) and clean Ctrl+C with the session saved.
- Retries on network cuts, truncates history in long tasks, and never leaves the project folder.

## Commands

| Command | What it does |
| --- | --- |
| `daya-code login` | Saves your token in `~/.daya/config.json` |
| `daya-code logout` | Deletes the saved token |
| `daya-code --version` | CLI version |
| `/clear` (interactive) | Restarts the conversation |

Each task consumes 1 message from your DAYA plan quota (same as the chat).

## Environment variables (optional)

| Variable | Description |
|---|---|
| `DAYA_TOKEN` | API token; overrides the one saved with `login` |
| `DAYA_API_URL` | DAYA backend URL (production by default) |
| `DAYA_YES` | `1` to skip confirmations |

## Requirements

Node 18+. No dependencies.
