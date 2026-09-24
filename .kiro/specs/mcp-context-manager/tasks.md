# Tasks — MCP Context Manager

## Task 1 — Project initialization
**Dependencies:** none

- [ ] Create `package.json` with `@modelcontextprotocol/server`, `zod`, `typescript`, `tsx`, `vitest`
- [ ] Create `tsconfig.json` (strict: true, target: ES2022, module: Node16)
- [ ] Create `vitest.config.ts`
- [ ] Create `.gitignore` (node_modules, dist, context-summaries/)

---

## Task 2 — Token estimation utility
**Dependencies:** Task 1

- [ ] Implement `estimateTokens(text: string): number` (chars/4 heuristic)
- [ ] Unit tests: empty text → 0, short text, long text, Unicode characters

**PBT Properties:**
- `estimateTokens(text) >= 0` for any text
- `estimateTokens("") === 0` always
- `estimateTokens(a + b) >= estimateTokens(a)` for any non-empty a, b
- `estimateTokens(text.repeat(n)) === estimateTokens(text) * n` (exact linearity)

---

## Task 3 — `estimate_tokens` tool
**Dependencies:** Task 2

- [ ] Define Zod schema: `{ text, context_limit? }`
- [ ] Implement handler: calculation + ok/warning/critical status + recommendation
- [ ] Tests: ok threshold (<60%), warning (60-90%), critical (>90%)

**PBT Properties:**
- `usage_percent` is always between 0 and 100 (or above if exceeded)
- `status === "ok"` if and only if `usage_percent < 60`
- `status === "warning"` if and only if `60 <= usage_percent < 90`
- `status === "critical"` if and only if `usage_percent >= 90`
- `estimated_tokens` increases strictly with text length

---

## Task 4 — `summarize_context` tool
**Dependencies:** Task 1

- [ ] Extract modified files (path regex)
- [ ] Extract decisions (patterns "decided", "going with", "→", "on a décidé", "on part sur")
- [ ] Extract next steps (patterns "TODO", "next step", "remaining", "à faire")
- [ ] Generate structured Markdown summary with "Resume Here" section
- [ ] Unit tests with fictitious session texts

**PBT Properties:**
- The summary always contains the 6 mandatory sections (`## Main Objective`, `## Decisions Made`, `## Modified Files`, `## Next Steps`, `## Warnings`, `## Resume Here`)
- `estimateTokens(summary) < 500` always — summary never exceeds 500 tokens
- Empty text produces a summary with 6 sections present but empty
- Text containing N valid file paths produces a summary with N entries in `## Modified Files`

---

## Task 5 — `suggest_cleanup` tool
**Dependencies:** Task 1

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

## Task 6 — `export_summary` tool
**Dependencies:** Task 4

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

## Task 7 — `load_session` tool
**Dependencies:** Task 6

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

## Task 8 — Main MCP server
**Dependencies:** Tasks 3, 4, 5, 6, 7

- [ ] Initialize `McpServer` with `serveStdio`
- [ ] Register all 5 tools with their Zod schemas
- [ ] Handle errors: return a clean MCP error response, never crash
- [ ] Verify connection with `npx @modelcontextprotocol/inspector`

**PBT Properties:**
- The server never crashes regardless of input (empty text, very long, special characters, invalid JSON)
- Each tool always returns a valid MCP response (never an unhandled exception)
- Invalid inputs (per Zod schema) return an MCP error with `isError: true`

---

## Task 9 — Documentation and packaging
**Dependencies:** Task 8

- [ ] Write `README.md`: installation, Kiro config, Claude Desktop config, usage examples
- [ ] Add `build` and `start` scripts to `package.json`
- [ ] Update `.kiro/settings/mcp.json` to point to `dist/index.js`
