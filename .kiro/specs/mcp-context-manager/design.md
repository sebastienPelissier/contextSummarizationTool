# Technical Design — MCP Context Manager

## Architecture

A minimal MCP server in TypeScript, transported via **stdio** (no HTTP). The AI client
(Kiro, Claude Desktop, etc.) launches the process locally and communicates via stdin/stdout
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
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
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
summarization ability. The full workflow is:

```
[Session starts]
    │
    ▼
Hook: session-id-capture (AgentSpawn — CLI only)
  → agent prompt: "Run /session-id and write the UUID to .kiro/.session-id"
  → .kiro/.session-id now contains the current session UUID

[After each agent response]
    │
    ▼
Hook: context-usage-reminder (AgentStop — command)
  SESSION_ID=$(cat .kiro/.session-id)
  CONTEXT=$(kiro-cli chat --agent-engine=v2 --no-interactive \
    --trust-tools=read --resume-id "$SESSION_ID" "/context")
  → reads REAL context % from Kiro (not an estimation)
  → if ≥ 90%: 🚨 CRITICAL — calls export_summary immediately
  → if ≥ 60%: ⚠️ WARNING — recommends summarize_context + export_summary
  → if < 60%: silent (no noise)

[User acts on warning — calls MCP tools]
    │
    ├─1. estimate_tokens(text: <specific excerpt to measure>)
    │     → useful for measuring weight of a file before loading it
    │     → NOT for total session usage (hook handles that)
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
    └─5. Agent: "Saved to <path>. Run /clear when ready."
         (server never triggers /clear — user action only)

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

**Key insight:** the `context-usage-reminder` hook reads the **real** context % via
`kiro-cli chat --agent-engine=v2 --no-interactive --resume-id <id> "/context"`.
This requires the session ID captured at startup by `session-id-capture` hook.
The MCP server's `estimate_tokens` is complementary — it measures specific text snippets,
not the total session usage.

## Exposed Tools (4)

The server exposes **4 tools**. `estimateTokens` is an internal utility used by the tools
but NOT exposed as a MCP tool — context window monitoring is handled by the
`context-usage-reminder` hook via `kiro-cli --no-interactive "/context"`.

### `summarize_context`
**Role:** validates and structures a summary the agent has already written.
Does NOT generate a summary from raw session text — the agent does that natively.

**Input:**
```typescript
{ draft_summary: string }
```
**Output:**
```typescript
{
  summary: string;          // validated and structured Markdown
  is_valid: boolean;
  warnings: string[];       // hollow phrases detected, missing sections, etc.
  estimated_tokens: number; // must be < 500
}
```

**Validation rules (from document-and-clear Skill experience):**
- All 6 sections must be present: `## Main Objective`, `## Decisions Made`, `## Modified Files`,
  `## Next Steps`, `## Warnings`, `## Resume Here`
- `## Main Objective` must be ≥ 3 words (not generic)
- `## Resume Here` must not contain hollow phrases like "continue where we left off"
- Hollow phrases flagged everywhere: `n/a`, `tbd`, `todo`, `nothing`, `none`, `-`, `???`
- At least one decision must have a reasoning (the "why" is critical)
- Total output must be < 500 tokens

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
- `repeated_content`: identical paragraphs (>3 lines) appearing 2+ times
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

**Kiro (`.kiro/settings/mcp.json`):**
```json
{
  "mcpServers": {
    "context-manager": {
      "command": "node",
      "args": ["./mcp-context-manager/dist/index.js"]
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
      "args": ["tsx", "./mcp-context-manager/src/index.ts"]
    }
  }
}
```
