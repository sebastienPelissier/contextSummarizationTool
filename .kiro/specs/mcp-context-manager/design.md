# Technical Design — MCP Context Manager

## Architecture

A minimal MCP server in TypeScript, transported via **stdio** (no HTTP). AI agent tools
(Kiro, Claude Code, Cursor, etc.) launch the process locally and communicate via stdin/stdout
following the MCP protocol. No external LLM — everything is local text processing (regex, heuristics).

```
mcp-context-manager/
├── src/
│   ├── index.ts              # Entry point — initializes the MCP server
│   ├── tools/
│   │   ├── summarize.ts      # summarize_context tool
│   │   ├── export.ts         # export_summary tool
│   │   ├── cleanup.ts        # suggest_cleanup tool
│   │   └── load.ts           # load_session tool
│   └── utils/
│       └── tokenizer.ts      # Internal utility — estimateTokens(text) used by tools
├── config/
│   ├── default.json          # Default configuration
│   ├── kiro.json             # Kiro-specific configuration
│   └── claude-code.json      # Claude Code-specific configuration
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Configuration System

The server supports multiple AI agent tools through configuration files. Each config defines:
- Session ID capture mechanism
- Context monitoring approach (CLI command + regex parser)
- File paths and directory structure
- Tool-specific commands and output parsing

**Configuration priority:**
1. Environment variable: `MCP_CONTEXT_CONFIG=kiro|claude-code|custom-path`
2. Auto-detection based on environment markers
3. Default configuration

**Output parsing:**
Each tool has a different output format for `/context`. The `output_regex` field extracts the
percentage value using a capture group:

- **Kiro** outputs: `Context breakdown - 1% used`
  - Regex: `Context breakdown - (\\d+)% used`
  - Capture group 1: the percentage number

- **Claude Code** outputs markdown:
  ```markdown
  ## Context Usage
  **Model:** claude-opus-5-5[1m]
  **Tokens:** 16k / 1m (2%)
  ```
  - Regex: `\\*\\*Tokens:\\*\\* [^(]+\\((\\d+)%\\)`
  - Capture group 1: the percentage number from the parentheses

**Config structure:**
```json
{
  "tool": "kiro",
  "paths": {
    "sessions_dir": "./context-summaries",
    "session_id_file": ".kiro/.session-id"
  },
  "hooks": {
    "session_id_capture": {
      "command": "/session-id",
      "description": "Captures session UUID for context monitoring"
    },
    "context_check": {
      "command": "kiro-cli chat --agent-engine=v2 --no-interactive --trust-tools=read --resume-id \"$(cat .kiro/.session-id)\" \"/context\"",
      "description": "Retrieves real context usage percentage",
      "output_regex": "Context breakdown - (\\d+)% used"
    }
  },
  "thresholds": {
    "warning": 0.60,
    "critical": 0.80
  }
}
```

**Example configurations:**

**kiro.json:**
```json
{
  "tool": "kiro",
  "paths": {
    "sessions_dir": "./context-summaries",
    "session_id_file": ".kiro/.session-id"
  },
  "hooks": {
    "session_id_capture": {
      "command": "/session-id",
      "output_file": ".kiro/.session-id"
    },
    "context_check": {
      "type": "cli",
      "command": "kiro-cli chat --agent-engine=v2 --no-interactive --trust-tools=read --resume-id \"$SESSION_ID\" \"/context\"",
      "output_regex": "Context breakdown - (\\d+)% used"
    }
  }
}
```

**claude-code.json:**
```json
{
  "tool": "claude-code",
  "paths": {
    "sessions_dir": "./context-summaries",
    "session_id_file": ".claude/.session-id"
  },
  "hooks": {
    "session_id_capture": {
      "command": "/session-id",
      "output_file": ".claude/.session-id"
    },
    "context_check": {
      "type": "cli",
      "command": "claude -p --resume \"$SESSION_ID\" \"/context\"",
      "output_regex": "\\*\\*Tokens:\\*\\* [^(]+\\((\\d+)%\\)"
    }
  }
}
```

## MCP Protocol (stdio)

```
AI Client                    mcp-context-manager
    │                                │
    │  (launches process via node)   │
    │ ──────────────────────────────>│
    │  initialize (JSON-RPC)         │
    │ ──────────────────────────────>│
    │  initialize response           │
    │ <──────────────────────────────│
    │  tools/list                    │
    │ ──────────────────────────────>│
    │  [5 tools]                     │
    │ <──────────────────────────────│
    │  tools/call "estimate_tokens"  │
    │ ──────────────────────────────>│
    │  {status: "warning", ...}      │
    │ <──────────────────────────────│
```

## Complete workflow (hooks + Skill + MCP server)

The server complements the `document-and-clear` Skill. It does NOT replace the agent's
summarization ability. The full workflow is tool-agnostic but examples use Kiro:

```
[Session starts]
    │
    ▼
Hook: session-id-capture (tool-specific)
  Kiro:        Run /session-id → write UUID to .kiro/.session-id
  Claude Code: Capture $CLAUDE_SESSION_ID → write to .claude/.session-id
  Generic:     No session tracking — rely on file timestamps

[After each agent response or on user demand]
    │
    ▼
Context monitoring (tool-specific)
  Kiro:        Hook reads real % via kiro-cli --resume-id ... "/context"
  Claude Code: Hook reads real % via claude -p --resume ... "/context"
  Generic:     Manual estimation via volume heuristics (>30 exchanges, large files)

  → if ≥ 80%: 🚨 CRITICAL — calls export_summary immediately
  → if ≥ 60%: ⚠️ WARNING — recommends summarize_context + export_summary
  → if < 60%: silent (no noise)

[User acts on warning — calls MCP tools]
    │
    ├─1. estimate_tokens(text: <specific excerpt to measure>)
    │     → useful for measuring weight of a file before loading it
    │     → NOT for total session usage (tool-specific hooks handle that)
    │
    ├─2. Agent writes summary draft natively
    │
    ├─3. summarize_context(draft_summary: "<agent-written summary>")
    │     → { is_valid, warnings[], summary }
    │     → validates 6 sections, flags hollow phrases
    │
    ├─4. export_summary(summary: "...", subject: "impl-mcp-tokens")
    │     → { file_path: "./context-summaries/session-2026-09-28-..." }
    │     → anti-overwrite: suffixes -2, -3 if file exists
    │
    └─5. Agent: "Saved to <path>. Run /clear or /compact when ready."
         (server never triggers clear/compact — user action only)

[New session — user says "resume from last session"]
    │
    ├─6. load_session()
    │     → { sessions: [{ file_name, date, objective }, ...] }
    │     → lists all available sessions, waits for user confirmation
    │     → never silently loads the most recent
    │
    └─7. load_session(file_name: "session-2026-09-28-impl-mcp-tokens.md")
          → { content: "## Main Objective\n..." }
          → agent injects as context
```

**Key insight for Kiro:** the `context-usage-reminder` hook reads the **real** context % via
`kiro-cli chat --agent-engine=v2 --no-interactive --resume-id <id> "/context"`.
This requires the session ID captured at startup by `session-id-capture` hook.

**Key insight for Claude Code:** similar capability via `claude -p --resume <id> "/context"`.
The `-p` flag runs in non-interactive mode for CLI automation.

**Key insight for other tools:** without CLI introspection, rely on volume heuristics
(>30 exchanges, repeated file reads, sub-agent launches) or manual user checks.

## Exposed Tools (4)

The server exposes **4 tools**. `estimateTokens` is an internal utility used by the tools
but NOT exposed as a MCP tool — context window monitoring is handled by the
`context-usage-reminder` hook via `kiro-cli --no-interactive "/context"`.

### `summarize_context`
**Role:** validates and structures a summary the agent has already written.
Does NOT generate a summary from raw session text — the agent does that natively.
Always uses **conversational mode** (≤ 1 000 tokens) — intermediate validation checkpoint.

**Input:**
```typescript
{ draft_summary: string }
```
**Output:**
```typescript
{
  summary: string;          // validated and structured Markdown
  is_valid: boolean;
  warnings: string[];       // hollow phrases detected, missing sections, token budget exceeded, etc.
  estimated_tokens: number;
  mode: 'conversational';   // always conversational — fixed
  token_budget: 1000;       // always 1000 — fixed
}
```

**Fixed mode rule:**
`summarize_context` always applies the `conversational` budget (≤ 1 000 tokens).
The agent does not choose the mode. Token budget overrun adds a warning but never blocks export.

**`export_summary` always applies `agentic` mode (≤ 2 000 tokens)** — before a `/clear`,
maximum detail is always warranted. See `export_summary` for details.

**Validation rules (from document-and-clear Skill experience):**
- All 6 sections must be present: `## Main Objective`, `## Decisions Made`, `## Modified Files`,
  `## Next Steps`, `## Warnings`, `## Resume Here`
- `## Main Objective` must be ≥ 3 words (not generic)
- `## Resume Here` must not contain hollow phrases like "continue where we left off"
- Hollow phrases flagged everywhere: `n/a`, `tbd`, `todo`, `nothing`, `none`, `-`, `???`
- At least one decision must have a reasoning (the "why" is critical)

**What it does NOT do:**
- Does not extract information from raw session text
- Does not rewrite the summary — it flags issues and returns the corrected structure
- Does not block export if warnings exist — it informs and lets the user decide

---

### `export_summary`
**Input:**
```typescript
{ summary: string; subject?: string; output_dir?: string }
```
**Output:**
```typescript
{ file_path: string; created: boolean }
```
**Naming:** `session-YYYY-MM-DD-<subject>.md`
- `subject` normalized to kebab-case ASCII, 5 words max
- If file already exists: suffix with `-2`, `-3`, etc. (never overwrite)
- Directory created automatically if absent (`fs.mkdir` with `recursive: true`)

**Fixed mode rule:** `export_summary` always validates the summary in `agentic` mode
(≤ 2 000 tokens) before writing. Before a `/clear`, maximum detail is always warranted.
The agent does not choose the mode.

---

### `suggest_cleanup`
**Input:**
```typescript
{ session_text: string }
```
**Output:**
```typescript
{
  suggestions: Array<{
    type: "code_block" | "repeated_content" | "resolved_errors" | "verbose_output";
    description: string;
    estimated_savings: number;  // approximate tokens
  }>;
  total_estimated_savings: number;
}
```
**Detection:**
- `code_block`: ` ``` ` blocks > 50 lines
- `repeated_content`: identical paragraphs (separated by blank lines, ≥ 120 chars) appearing 2+ times
- `resolved_errors`: blocks containing `Error:` or `❌` followed by a success message later
- `verbose_output`: command outputs > 30 lines (`$`, `>`, listing results)

---

### `load_session`
**Input:**
```typescript
{ file_name?: string; sessions_dir?: string }  // sessions_dir default: "./context-summaries"
```
**Output (without file_name):** list of available sessions
```typescript
{
  sessions: Array<{
    file_name: string;
    date: string;
    subject: string;
    objective: string;  // first line after "## Main Objective"
  }>;
}
```
**Output (with file_name):** file content
```typescript
{ file_name: string; content: string }
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/server": "^2.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "vitest": "^2.x",
    "@types/node": "^22.x"
  }
}
```

`"type": "module"` required in `package.json` — SDK v2 is ES modules only.

No network dependency. Works entirely offline.

## SDK v2 Imports

```typescript
// Server entry point
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

// Server creation pattern
function createServer(): McpServer {
  const server = new McpServer({ name: 'context-manager', version: '1.0.0' });

  server.registerTool('tool_name', {
    description: '...',
    inputSchema: z.object({ field: z.string() })
  }, async (input) => ({
    content: [{ type: 'text', text: result }]
  }));

  return server;
}

void serveStdio(createServer);
```

**stdout = protocol channel** — use `console.error()` only for logs, never `console.log()`.

## Client Configuration

The MCP server can be configured for different AI agent tools. Each tool may have its own
configuration approach.

**Kiro (`.kiro/settings/mcp.json`):**
```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["./mcp-context-manager/dist/index.js"],
      "env": {
        "MCP_CONTEXT_CONFIG": "kiro"
      }
    }
  }
}
```

**Claude Desktop (`claude_desktop_config.json`):**
```json
{
  "mcpServers": {
    "context-manager": {
      "command": "npx",
      "args": ["tsx", "./mcp-context-manager/src/index.ts"],
      "env": {
        "MCP_CONTEXT_CONFIG": "claude-code"
      }
    }
  }
}
```

**Generic (any MCP-compatible tool):**
```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["./mcp-context-manager/dist/index.js"],
      "env": {
        "MCP_CONTEXT_CONFIG": "/path/to/custom-config.json"
      }
    }
  }
}
```

The server will:
1. Check `MCP_CONTEXT_CONFIG` environment variable
2. If not set, auto-detect based on environment markers
3. Fall back to `config/default.json`

Configuration affects:
- Default `sessions_dir` path for `load_session` and `export_summary`
- Hook integration documentation (README)
- Example setup instructions
