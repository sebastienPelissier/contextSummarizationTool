kiro-cli --resume-id cli_3342dc00-47e5-456b-aaae-b62f0afcdcac_CvkJS8dD
# MCP Context Manager

> A local MCP server for AI session context management — transparent, offline, no black box.


## Overview

`mcp-context-manager` is a local [Model Context Protocol](https://modelcontextprotocol.io/) server
written in TypeScript that helps AI assistants manage their context window during long sessions.
It exposes 5 tools to measure, summarize, clean up, export and resume session context.
---

## Features

| Tool | Description |
|------|-------------|
| `estimate_tokens` | Estimates token usage and returns ok / warning / critical status |
| `summarize_context` | Extracts a structured Markdown summary from session text |
| `suggest_cleanup` | Identifies verbose or redundant content to remove |
| `export_summary` | Saves the summary to a timestamped Markdown file |
| `load_session` | Lists and loads previous session files for context resumption |

**All processing is local** — no external LLM, no network calls, heuristics and regex only.
Works completely offline.

---

## Context thresholds

Based on field-tested experience:

| Status | Threshold | Recommended action |
|--------|-----------|-------------------|
| `ok` | < 60% | No action needed |
| `warning` | 60–90% | Run `summarize_context` + `export_summary` |
| `critical` | > 90% | Export immediately before context loss |

---

## Installation

### Prerequisites

- Node.js 24+
- npm

### Build from source

```bash
npm install
npm run build
```

---

## Configuration

### Kiro (`.kiro/settings/mcp.json`)

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

### Claude Desktop (`claude_desktop_config.json`)

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

---

## Usage

### Estimate current context usage

```
Call estimate_tokens with your session text.
→ Returns: estimated_tokens, usage_percent, status, recommendation
```

### Summarize and export before clearing

```
1. Call summarize_context with your session text
2. Review the summary — especially the "## Resume Here" section
3. Call export_summary with the summary and a subject
→ Returns: file path in ./context-summaries/
4. Ask the user to run /clear
```

### Resume a previous session

```
1. Call load_session (no arguments) to list available sessions
2. Confirm which session to load with the user
3. Call load_session with the file name
→ Returns: session content ready to inject as context
```

---

## Session files

Exported summaries are saved in `./context-summaries/` with the format:

```
session-YYYY-MM-DD-<subject>.md
```

Each file contains 6 mandatory sections:

```markdown
## Main Objective
## Decisions Made
## Modified Files
## Next Steps
## Warnings
## Resume Here
```

The `## Resume Here` section contains the suggested first prompt for the next session —
the most critical section for context resumption.

> ⚠️ **Security note**: Session files may contain sensitive information discussed during the
> session (architecture decisions, credentials mentioned, etc.).
> Add `context-summaries/` to your `.gitignore` to prevent accidental commits.

---

## Project structure

```
mcp-context-manager/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   ├── tokens.ts         # estimate_tokens
│   │   ├── summarize.ts      # summarize_context
│   │   ├── cleanup.ts        # suggest_cleanup
│   │   ├── export.ts         # export_summary
│   │   └── load.ts           # load_session
│   └── utils/
│       └── tokenizer.ts      # Token estimation utility
├── plugin.json               # Kiro Power manifest
├── mcp.json                  # MCP server configuration
├── skills/
│   └── context-export/
│       └── SKILL.md          # Context export workflow
└── dev.kiro/
    └── steering/
        └── context-manager.md
```

---

## Kiro Power

This project is also a [Kiro Power](https://kiro.dev/powers/) — install it to get the
`context-export` Skill and the MCP server loaded automatically when you mention keywords like
`context`, `tokens`, `session`, `export session`, or `resume session`.

---

## Development

### Run in development mode

```bash
npm run dev
```

### Run tests

```bash
npm test
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector npx tsx src/index.ts
```

---
