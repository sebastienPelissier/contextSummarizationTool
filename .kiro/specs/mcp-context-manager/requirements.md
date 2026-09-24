# Requirements — MCP Context Manager

## Overview

A local MCP server (stdio) written in TypeScript/Node.js that exposes context window management
tools for AI assistants (Kiro, Claude Desktop, Cursor, etc.). Inspired by the "document-and-clear"
workflow, it enables summarizing, exporting, monitoring and resuming session context to prevent
context window saturation — no black box, no external LLM, fully local text processing.

> Model = CPU. Context window = RAM. This MCP server = the OS that loads only what is needed.

## User Stories

### US-1 — Summarize current context

**As** a user of an AI assistant in a long session,
**I want** to request a structured summary of what has been accomplished in the session,
**So that** I can keep a clear record without having to re-read the entire conversation.

**Acceptance criteria:**
- GIVEN session text provided
- WHEN the `summarize_context` tool is called
- THEN it returns a structured Markdown summary with the following sections:
  - Main objective of the session
  - Decisions made (with reasoning if detectable)
  - Files created or modified
  - Next steps
  - Warnings / pitfalls identified
- AND the summary is less than 500 tokens

### US-2 — Export summary to an injectable file

**As** a user,
**I want** to save the session summary to a structured Markdown file,
**So that** I can inject it directly as context in a future session.

**Acceptance criteria:**
- GIVEN a generated summary
- WHEN the `export_summary` tool is called with an optional subject
- THEN a `session-YYYY-MM-DD-<subject>.md` file is created in `./context-summaries/`
- AND if a file with the same name already exists, it is suffixed `-2`, `-3`, etc. (never overwritten)
- AND the file contains a `## Resume Here` block with the suggested first prompt for the next session

### US-3 — Estimate context usage

**As** a user,
**I want** to know the approximate token usage of the current session,
**So that** I know when to act before hitting the limit.

**Acceptance criteria:**
- GIVEN session text provided
- WHEN the `estimate_tokens` tool is called
- THEN it returns the approximate token count and a usage percentage
- AND it indicates the status based on field-tested thresholds:
  - `ok`: < 60%
  - `warning`: 60–90% → recommends triggering `summarize_context` + `export_summary`
  - `critical`: > 90% → recommends immediate export before context loss

### US-4 — Suggest cleanup

**As** a user,
**I want** to receive suggestions on what can be removed from the context without losing critical information,
**So that** I can free up space in the context window.

**Acceptance criteria:**
- GIVEN session content
- WHEN the `suggest_cleanup` tool is called
- THEN it identifies redundant or verbose elements:
  - Long code blocks (> 50 lines) already integrated into files
  - Error logs from already-resolved steps
  - Duplicated or repeated content
  - Verbose tool outputs (e.g. directory listings already processed)
- AND it returns a concrete list of suggestions with estimated token savings per item

### US-5 — Resume session

**As** a user starting a new session,
**I want** to list and load a previous session summary,
**So that** I can resume exactly where I left off without re-explaining the context.

**Acceptance criteria:**
- GIVEN a `./context-summaries/` directory containing session files
- WHEN the `load_session` tool is called without arguments
- THEN it returns the list of available sessions (name + date + extracted objective)
- WHEN called with a file name
- THEN it returns the file content ready to be injected as context

### US-6 — Multi-client compatibility

**As** a developer using multiple AI tools,
**I want** to install the server once and configure it in any MCP client,
**So that** I don't have to maintain separate tools per client.

**Acceptance criteria:**
- GIVEN the server pointed to by relative path in `mcp.json`
- WHEN configured in Kiro, Claude Desktop, Cursor, or any compatible MCP client
- THEN the server responds correctly via the MCP over stdio protocol
- AND no external network dependency is required (works offline)
