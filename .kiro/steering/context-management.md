# Context Management Domain — mcp-context-manager

This steering file captures the **domain knowledge** behind the mcp-context-manager project,
distilled from field-tested experience with the `document-and-clear` Skill (v2.1, author: spelissier).
It defines how the tools must behave, not how to code them.

## Core mental model

> Model = CPU. Context window = RAM. This MCP server = the OS that loads only what is needed.

The context window is a finite resource. When it fills up, the model degrades before hitting
the hard limit — it does not fail cleanly. This degradation is called **context rot**.

## Context rot signals

These are the real-world signals that indicate context is becoming a problem.
The tools must be able to detect and surface these patterns:

- **Repeated errors**: the agent makes the same mistake it already corrected earlier in the session
- **Convention drift**: code produced no longer matches the conventions established at session start
- **API hallucinations**: the agent invents method signatures or parameters that don't exist
- **Contradictions**: the agent contradicts a decision it made earlier without acknowledging it
- **Loop behavior**: the agent keeps trying the same failed approach without escalating

Context rot can occur at 20% context usage as well as at 90%. It is a quality signal,
not a quantity signal. The `suggest_cleanup` tool must reflect this — it is not just about
saving tokens, it is about identifying what is degrading response quality.

## The three-phase workflow (MEASURE → DOCUMENT → RESUME)

This is the validated workflow from field experience. The tools must support it end to end.

### Phase 1 — MEASURE

The agent has **no introspective access** to its own context percentage.
It cannot estimate this value reliably — it must be provided externally.

`estimate_tokens` is the tool that provides this measurement. Key rules:
- Never guess or estimate the percentage without calling `estimate_tokens`
- If context rot signals are present, act regardless of the percentage
- Suggest calling `estimate_tokens` when volume heuristics apply (>30 exchanges, many large files read)

### Phase 2 — DOCUMENT

The summary produced by `summarize_context` must capture what matters for resumption,
not just what happened. The difference:

| What happened (not enough) | What matters for resumption (required) |
|---|---|
| "We worked on the tokenizer" | "estimateTokens() implemented, chars/4 heuristic, tests passing" |
| "There were some errors" | "tsc error on line 42 — fixed by adding explicit return type" |
| "We discussed architecture" | "Decided: serveStdio over StdioServerTransport — reason: SDK v2 deprecates the latter" |

**The "why" is always more valuable than the "what".**

Critical fields that must never be empty or generic in an exported summary:
- Main objective (must be specific, minimum 3 words)
- At least one decision with its reasoning
- `## Resume Here` section with a concrete first prompt

**Hollow phrases to detect and reject** (from validation script experience):
`n/a`, `tbd`, `todo`, `see later`, `nothing`, `none`, `-`, `???`

### Phase 3 — RESUME

When loading a previous session via `load_session`:
- **Never silently load the most recent file** — list available sessions and let the user confirm
- Exception: if the user already named the subject in their request, load it directly
- After loading, the content must be ready to inject as context — no transformation needed

## Anti-overwrite rule

Session files are **append-only by convention**. Once created, a session file is never modified.
If a second export is needed for the same subject and date:
- Suffix with `-2`, `-3`, etc.
- This creates an audit trail of session snapshots

Rationale: a session file may be the only record of a decision made during a deleted conversation.
Overwriting it destroys that record permanently.

## The `/clear` boundary

`/clear` (or `/compact`) is a **user action**, not a tool action. The server must never:
- Trigger a clear operation itself
- Assume the user will clear after an export
- Block the user from clearing without documenting (warn once, then comply)

The server's job is to make the export so complete that clearing is safe.
The decision to clear belongs to the user.

## What a good summary looks like

A good `summarize_context` output:
- Fits in < 500 tokens (itself does not bloat the next session)
- Contains the 6 mandatory sections (Main Objective, Decisions Made, Modified Files, Next Steps, Warnings, Resume Here)
- Has a `## Resume Here` section with a prompt specific enough to restart work immediately
- Does not contain redundant tool call outputs or raw error logs

A bad summary:
- Copies large blocks of code from the session
- Lists every file read without saying why
- Has empty sections filled with "N/A"
- Has a `## Resume Here` section that says "Continue where we left off"

## Token estimation accuracy

The chars/4 heuristic is an approximation. Known behavior:
- English prose: ~±10% accuracy
- Code: tends to underestimate (tokens per char is higher for code)
- Unicode / non-Latin scripts: underestimates significantly (multi-byte chars count as 1 char but multiple tokens)

The `estimate_tokens` tool must communicate this uncertainty in its `recommendation` field.
It is a signal, not a hard measurement.

## MCP server limitations

The MCP server runs as a separate process. It has **no introspective access** to the client's
context window. This means:

- `estimate_tokens` measures the text **provided as argument** — not the actual session usage
- `/context` (the only reliable source of exact usage %) is a Kiro CLI internal command,
  inaccessible from the MCP server process
- The server cannot trigger `/clear` or any client-side action

**Practical consequence:** the `context-usage-reminder` hook compensates for this by suggesting
the user run `/context` when the session seems long in volume. The MCP server's `estimate_tokens`
is useful for measuring specific text snippets (e.g., "how heavy is this file I'm about to load?"),
not for reading the total session usage.

## Session file security note

Session files may contain sensitive information (API keys mentioned in conversation,
architecture decisions, credentials discussed). The `context-summaries/` directory should be
listed in `.gitignore` by default. The `export_summary` tool should not enforce this
(it is not its responsibility) but the README must document it clearly.
