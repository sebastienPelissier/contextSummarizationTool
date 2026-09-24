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
│   │   ├── tokens.ts         # estimate_tokens tool
│   │   ├── cleanup.ts        # suggest_cleanup tool
│   │   └── load.ts           # load_session tool
│   └── utils/
│       └── tokenizer.ts      # Token estimation (chars/4 heuristic)
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

## Exposed Tools

### `estimate_tokens`
**Input:**
```typescript
{ text: string; context_limit?: number }  // context_limit default: 200000
```
**Output:**
```typescript
{
  estimated_tokens: number;
  context_limit: number;
  usage_percent: number;
  status: "ok" | "warning" | "critical";
  recommendation: string;
}
```
**Thresholds (field-tested):**
- `ok`: < 60%
- `warning`: 60–90% → recommends triggering `summarize_context` + `export_summary`
- `critical`: > 90% → immediate export recommended

**Heuristic:** `tokens ≈ chars / 4` (GPT/Claude approximation, ±15% accuracy)

---

### `summarize_context`
**Input:**
```typescript
{ session_text: string }
```
**Output:** structured Markdown summary:
```markdown
## Main Objective
...

## Decisions Made
- [decision] — [reasoning if detectable]

## Modified Files
- `path/to/file.ts` — [description]

## Next Steps
- ...

## Warnings
- ...

## Resume Here
[Suggested first prompt for the next session]
```
**Pattern extraction:**
- Files: regex on paths (`/[\w./\-]+\.(ts|js|py|md|json|yaml)/g`)
- Decisions: keywords (`"decided"`, `"choice"`, `"→"`, `"going with"`, `"on a décidé"`, `"on part sur"`)
- Next steps: patterns (`"TODO"`, `"next step"`, `"remaining"`, `"à faire"`, `"il reste"`)

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
