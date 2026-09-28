# Tasks — MCP Context Manager

## Task 1 — Project initialization
**Dependencies:** none

- [ ] Create `package.json` with `@modelcontextprotocol/server`, `zod`, `typescript`, `tsx`, `vitest`
- [ ] Create `tsconfig.json` (strict: true, target: ES2022, module: Node16)
- [ ] Create `vitest.config.ts`
- [ ] Create `.gitignore` (node_modules, dist, context-summaries/)

---

## Task 2 — Token estimation utility (internal)
**Dependencies:** Task 1

`estimateTokens` is an internal utility, NOT an exposed MCP tool.
Used by `summarize_context` (validates < 500 tokens) and `suggest_cleanup` (estimates savings).

- [ ] Implement `estimateTokens(text: string): number` (chars/4 heuristic)
- [ ] Unit tests: empty text → 0, short text, long text, Unicode characters

**PBT Properties:**
- `estimateTokens(text) >= 0` for any text
- `estimateTokens("") === 0` always
- `estimateTokens(a + b) >= estimateTokens(a)` for any non-empty a, b
- `estimateTokens(text.repeat(n)) === estimateTokens(text) * n` (exact linearity)

---

## Task 3 — `summarize_context` tool
**Dependencies:** Task 2

**Role:** validates and structures a summary the agent has already written.
Does NOT generate from raw session text — the agent does that natively.

- [ ] Define Zod schema: `{ draft_summary: string }`
- [ ] Detect presence of 6 mandatory sections
- [ ] Detect hollow phrases: `n/a`, `tbd`, `todo`, `nothing`, `none`, `-`, `???`
- [ ] Validate `## Main Objective` is ≥ 3 words
- [ ] Validate `## Resume Here` is not generic ("continue where we left off")
- [ ] Validate at least one decision has reasoning
- [ ] Return `{ summary, is_valid, warnings[], estimated_tokens }`
- [ ] Unit tests: valid summary, missing sections, hollow phrases, generic Resume Here

**PBT Properties:**
- `is_valid === true` if and only if all 6 sections present AND no hollow phrases AND objective ≥ 3 words
- `warnings` is empty when `is_valid === true`
- `estimated_tokens` always equals `estimateTokens(summary)`
- `estimated_tokens < 500` for any well-formed summary
- A summary with all 6 sections non-empty and no hollow phrases always returns `is_valid: true`

---

## Task 4 — `suggest_cleanup` tool
**Dependencies:** Task 2

- [ ] Detect code blocks > 50 lines
- [ ] Detect repeated content (paragraphs > 3 lines appearing 2+ times)
- [ ] Detect resolved errors (`Error:` followed by a success message)
- [ ] Detect verbose outputs (listings > 30 lines)
- [ ] Return suggestions + total_estimated_savings
- [ ] Unit tests for each detection type

**PBT Properties:**
- `total_estimated_savings === sum(suggestions[].estimated_savings)` always
- `estimated_savings >= 0` for each suggestion
- Text with no detectable pattern returns `suggestions: []` and `total_estimated_savings: 0`
- Text with N code blocks > 50 lines produces at least N suggestions of type `code_block`
- `total_estimated_savings <= estimateTokens(session_text)` — cannot save more than the total

---

## Task 5 — `export_summary` tool
**Dependencies:** Task 3

- [ ] Normalize subject to kebab-case ASCII (5 words max)
- [ ] Naming `session-YYYY-MM-DD-<subject>.md` with anti-overwrite suffix
- [ ] Create `./context-summaries/` directory if absent
- [ ] Write file and return path
- [ ] Tests: naming, anti-overwrite, directory creation

**PBT Properties:**
- Two successive calls with the same subject produce two different paths (anti-overwrite)
- The created file always exists on the filesystem after a successful call
- Normalized subject never contains accents, spaces or special characters
- Normalized subject contains at most 5 words separated by hyphens
- N successive calls with the same subject produce files `-1`, `-2`, ..., `-N-1`

---

## Task 6 — `load_session` tool
**Dependencies:** Task 5

- [ ] List `.md` files in `./context-summaries/` with date + extracted objective
- [ ] Load a specific file by name
- [ ] Handle missing directory case (return empty list, no error)
- [ ] Tests: empty list, list with files, load by name

**PBT Properties:**
- If N files are exported via `export_summary`, `load_session` without arguments returns exactly N sessions
- A file exported then loaded via `load_session` returns content identical to what was written
- `load_session` on a missing directory always returns `{ sessions: [] }` without error
- `load_session` with a non-existent file name returns a clean MCP error, never a crash

---

## Task 7 — Main MCP server
**Dependencies:** Tasks 3, 4, 5, 6

- [ ] Initialize `McpServer` with `serveStdio`
- [ ] Register all 5 tools with their Zod schemas
- [ ] Handle errors: return a clean MCP error response, never crash
- [ ] Verify connection with `npx @modelcontextprotocol/inspector`

**PBT Properties:**
- The server never crashes regardless of input (empty text, very long, special characters, invalid JSON)
- Each tool always returns a valid MCP response (never an unhandled exception)
- Invalid inputs (per Zod schema) return an MCP error with `isError: true`

---

## Task 8 — Documentation and packaging
**Dependencies:** Task 7

- [ ] Write `README.md`: installation, Kiro config, Claude Desktop config, usage examples
- [ ] Document `estimate_tokens` scope clearly: measures provided text, not actual session usage
- [ ] Document the hook pair:
  - `session-id-capture` (AgentSpawn): captures `/session-id` → `.kiro/.session-id`
  - `context-usage-reminder` (AgentStop): calls `/context` in headless mode via `--resume-id`, warns at ≥ 60% and ≥ 90%
- [ ] Document prerequisite: `KIRO_API_KEY` required for headless `/context` calls
- [ ] Add `build` and `start` scripts to `package.json`
- [ ] Update `.kiro/settings/mcp.json` to point to `dist/index.js` and enable the server (set `disabled: false`)
