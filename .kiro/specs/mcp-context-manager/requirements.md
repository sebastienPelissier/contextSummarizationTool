# Requirements — MCP Context Manager

## Overview

A local MCP server (stdio) written in TypeScript/Node.js that exposes context window management
tools for AI assistants (Kiro, Claude Desktop, Cursor, etc.).

**Relationship with the `document-and-clear` Skill:**
The Skill already handles the core summarization workflow natively via the agent. This MCP server
complements it with what the Skill cannot do alone:
- **Automated context monitoring** via an `AgentSpawn` + `AgentStop` hook pair that uses
  `kiro-cli chat --agent-engine=v2 --no-interactive --resume-id <id> "/context"` to read the
  real context window % after each agent response — no estimation, the exact Kiro value
- **Structured validation and export** of agent-generated summaries to injectable Markdown files
- **Cleanup suggestions** identifying verbose/redundant content to remove
- **Session resumption** listing and loading previous session files across any MCP client

The server does NOT replace the agent's summarization ability. `summarize_context` validates and
structures a summary the agent has already written — it does not generate it from raw session text.

**Note on `estimate_tokens`:** this tool measures the text provided as argument — useful for
estimating the weight of a specific file or excerpt before loading it. It does NOT read the actual
session context usage. The `context-usage-reminder` hook handles real-time session monitoring via
`/context` in headless mode.

> Model = CPU. Context window = RAM. This MCP server = the OS that loads only what is needed.

## User Stories

### US-1 — Validate and structure a summary

**As** a user of an AI assistant,
**I want** to validate and structure a summary I've written with the agent,
**So that** it meets the required format for injection in a future session.

**Acceptance criteria:**
- GIVEN a draft summary text produced by the agent
- WHEN the `summarize_context` tool is called with that text
- THEN it validates presence of the 6 mandatory sections
- AND it returns a structured Markdown summary with sections correctly formatted:
  - `## Main Objective` (must be specific, minimum 3 words)
  - `## Decisions Made` (with reasoning — the "why" is required)
  - `## Modified Files`
  - `## Next Steps`
  - `## Warnings`
  - `## Resume Here` (concrete first prompt for next session — never "continue where we left off")
- AND it flags hollow phrases: `n/a`, `tbd`, `todo`, `nothing`, `none`, `-`, `???`
- AND the output is less than 500 tokens

### US-2 — Export summary to an injectable file

**As** a user,
**I want** to save a validated summary to a structured Markdown file,
**So that** I can inject it directly as context in a future session.

**Acceptance criteria:**
- GIVEN a validated summary
- WHEN the `export_summary` tool is called with an optional subject
- THEN a `session-YYYY-MM-DD-<subject>.md` file is created in `./context-summaries/`
- AND if a file with the same name already exists, it is suffixed `-2`, `-3`, etc. (never overwritten)
- AND the file contains a `## Resume Here` block with the suggested first prompt for the next session

### US-3 — Suggest cleanup

**As** a user,
**I want** to receive suggestions on what can be removed from the context without losing critical information,
**So that** I can free up space in the context window.

**Acceptance criteria:**
- GIVEN session content
- WHEN the `suggest_cleanup` tool is called
- THEN it identifies verbose or redundant elements:
  - Long code blocks (> 50 lines) already integrated into files
  - Error logs from already-resolved steps
  - Duplicated or repeated content
  - Verbose tool outputs (directory listings, command outputs > 30 lines)
- AND it returns a concrete list of suggestions with estimated token savings per item
- AND `total_estimated_savings` equals the sum of individual savings

### US-4 — Resume session

**As** a user starting a new session,
**I want** to list and load a previous session summary,
**So that** I can resume exactly where I left off without re-explaining the context.

**Acceptance criteria:**
- GIVEN a `./context-summaries/` directory containing session files
- WHEN the `load_session` tool is called without arguments
- THEN it returns the list of available sessions (name + date + extracted objective)
- AND it never silently loads the most recent file — always lists and lets the user confirm
- WHEN called with a file name
- THEN it returns the file content ready to be injected as context

### US-5 — Multi-client compatibility

**As** a developer using multiple AI tools,
**I want** to install the server once and configure it in any MCP client,
**So that** I don't have to maintain separate tools per client.

**Acceptance criteria:**
- GIVEN the server pointed to by relative path in `mcp.json`
- WHEN configured in Kiro, Claude Desktop, Cursor, or any compatible MCP client
- THEN the server responds correctly via the MCP over stdio protocol
- AND no external network dependency is required (works offline)
- AND the server never crashes — always returns a valid MCP response
