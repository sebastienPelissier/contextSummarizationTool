# MCP Context Manager

> The model is the CPU. The context window is RAM. This server is the OS that loads only what is needed.
>
> — Benoît Fontaine, Devoxx France 2026

A **tool-agnostic MCP server** for AI session context management. Works with Kiro, Claude Code, Cursor, and any MCP-compatible agent tool.

---

## Why This Project Exists

At 60% context usage, performance degrades. At 80%, your session is compromised.
Claude's auto-compaction triggers at 83.5% — that's too late.

Three mechanisms explain this degradation:

- **Attention dilution**: each token receives proportionally less attention as context grows
- **Lost in the middle**: Stanford measures a 30% precision loss on content in the middle of context
- **Interference by distraction**: semantically similar but irrelevant code actively degrades performance

The solution: **never exceed 60% context**. Compact before, not after.

---

## The Document and Clear Workflow

This server implements the **Document and Clear** workflow — the transparent alternative to `/compact`
where you control exactly what is preserved.

```
1. DOCUMENT   → The agent writes the session summary
               → summarize_context validates format (6 sections, no hollow phrases)
               → export_summary saves as injectable Markdown

2. CLEAR      → User runs /clear or /compact
               → New clean session, context at 0%

3. RESUME     → load_session lists available sessions
               → User confirms which one to load
               → Content is injected as initial context
```

Unlike `/compact` (black box), you know exactly what is transmitted to the next session.

---

## Context Rot Signals

Don't wait for 60% to act. These signals indicate context is already compromised,
regardless of percentage:

- **API hallucinations**: the agent calls methods that don't exist
- **Forgotten conventions**: produced code no longer follows rules established at session start
- **Error loops**: the agent repeats the same approach that already failed
- **Inconsistent code**: the agent contradicts what it coded a few exchanges earlier

If you observe any of these signals: **launch the workflow immediately**, without waiting for `/context`.

---

## The 4 MCP Tools

| Tool | Role |
|------|------|
| `summarize_context` | Validates a summary written by the agent — checks 6 sections, detects hollow phrases |
| `suggest_cleanup` | Identifies verbose content to remove: code blocks > 50 lines, resolved errors, repeated content |
| `export_summary` | Saves summary as `session-YYYY-MM-DD-<subject>.md` — automatic anti-overwrite |
| `load_session` | Lists available sessions and loads the one confirmed by the user |

**All processing is local** — no external LLM, no network. Works offline.

---

## Multi-Tool Configuration System

The server adapts to different AI agent tools through configuration files. Three configs are provided:

| Config | Tool | Context Monitoring | Sessions Directory |
|--------|------|-------------------|-------------------|
| `config/kiro.json` | Kiro | CLI via `kiro-cli` | `./context-summaries` |
| `config/claude-code.json` | Claude Code | CLI via `claude -p` | `./context-summaries` |
| `config/default.json` | Generic | Manual/heuristics | `./context-summaries` |

### Configuration Selection

The server selects a configuration in this priority order:

1. **`MCP_CONTEXT_CONFIG` environment variable**: Set to tool name (`kiro`, `claude-code`) or custom config path
2. **Auto-detection**: Based on environment markers (`KIRO_SESSION_ID`, `CLAUDE_SESSION_ID`, etc.)
3. **Fallback**: Uses `config/default.json`

### Tool-Specific Features

Each configuration defines:
- **`sessions_dir`**: Default directory for session files
- **`session_id_file`**: Where to store the current session ID
- **`context_check.command`**: CLI command to get real context usage
- **`context_check.output_regex`**: Regex to extract percentage from CLI output
- **`thresholds`**: Warning (60%) and critical (80%) levels

**Output parsing examples:**

- **Kiro** outputs: `Context breakdown - 15% used`
  - Regex: `Context breakdown - (\\d+)% used`

- **Claude Code** outputs markdown:
  ```markdown
  ## Context Usage
  **Tokens:** 16k / 1m (2%)
  ```
  - Regex: `\\*\\*Tokens:\\*\\* [^(]+\\((\\d+)%\\)`

---

## Automated Context Monitoring

### Kiro

Two hooks (in `.kiro/hooks/`) read the **real context percentage** via headless CLI:

```
Session starts
  → session-id-capture (SessionStart hook): stores UUID in .kiro/.session-id

After each agent response
  → context-usage-reminder (hook):
    kiro-cli chat --agent-engine=v2 --no-interactive \
      --resume-id "$(cat .kiro/.session-id)" "/context"

    >= 80% → CRITICAL — immediate export recommended
    >= 60% → WARNING — trigger Document and Clear workflow
    < 60%  → silent
```

### Claude Code

Similar monitoring available via `claude -p --resume <id> "/context"`:

```bash
SESSION_ID=$(cat .claude/.session-id)
claude -p --resume "$SESSION_ID" "/context"
```

### Generic Tools

Without CLI introspection, rely on:
- **Volume heuristics**: >30 exchanges, many large files read, multiple sub-agents
- **Manual checks**: User runs context command when signs appear
- **Context rot signals**: API hallucinations, forgotten conventions, error loops

---

## Session File Structure

Exported summaries follow this format:

```
session-YYYY-MM-DD-<subject>.md
```

Each file must contain **6 mandatory sections**:

```markdown
## Main Objective
## Decisions Made
## Modified Files
## Next Steps
## Warnings
## Resume Here
```

The `## Resume Here` section contains the suggested first prompt for the next session —
it's the most critical section. A summary that says "Continue where we left off" is rejected.

---

## Installation

```bash
cd mcp-context-manager
npm install
npm run build
```

**Prerequisites:** Node.js 24+

---

## Configuration Examples

### Kiro

In `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-manager/dist/index.js"],
      "env": {
        "MCP_CONTEXT_CONFIG": "kiro"
      },
      "autoApprove": ["summarize_context", "suggest_cleanup", "export_summary", "load_session"]
    }
  }
}
```

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-context-manager/src/index.ts"],
      "env": {
        "MCP_CONTEXT_CONFIG": "claude-code"
      }
    }
  }
}
```

### Generic / Cursor

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-manager/dist/index.js"]
    }
  }
}
```

*(Without `MCP_CONTEXT_CONFIG`, auto-detects or falls back to `config/default.json`)*

### Custom Configuration

Create your own config file and point to it:

```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-manager/dist/index.js"],
      "env": {
        "MCP_CONTEXT_CONFIG": "/path/to/my-custom-config.json"
      }
    }
  }
}
```

---

## Security Note

Session files may contain sensitive information discussed during the session.
Add `context-summaries/` to your `.gitignore`.

---

## References

- Context Engineering — Benoît Fontaine, Devoxx France 2026
- [document-and-clear Skill](../../.kiro/skill/context-engineering/SKILL.md) — interactive guided workflow
- [Model Context Protocol](https://modelcontextprotocol.io/)

---

## License

Apache-2.0
