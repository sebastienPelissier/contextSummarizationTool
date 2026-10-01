---
name: context-export
description: >
  Transparent AI session context management via MCP tools.
  Use this skill when: (1) the context window approaches 60%, (2) context rot signals appear
  (hallucinations, forgotten conventions, error loops), (3) before closing a session to preserve
  decisions, (4) to resume a previous session.
---

# Context Export

> Model = CPU. Context window = RAM. This skill = the OS that loads only what is needed.

## When to trigger

1. **`estimate_tokens` indicates ≥ 60%** → act immediately
2. **Context rot signals**: repeated errors, contradiction with earlier output,
   API hallucinations, code inconsistent with conventions → trigger regardless of %
3. **High volume**: session > 30 exchanges, many files read → propose checking with `estimate_tokens`

## Workflow

### Phase 1 — MEASURE

Call `estimate_tokens` with the current session text.

- **< 60%** → no action needed, inform the user
- **60–80%** → proceed to Phase 2
- **> 80%** → urgent, go directly to Phase 2 and flag it clearly

### Phase 2 — DOCUMENT

1. Call `summarize_context` with the session text
2. Verify the summary contains:
   - The main objective of the session
   - Decisions made (with their reasoning — the "why" is critical)
   - Files created or modified
   - Concrete next steps
   - The `## Resume Here` section with the first prompt for the next session
3. If a section is empty or too vague, enrich it manually before exporting

### Phase 3 — EXPORT

Call `export_summary` with:
- `summary`: the validated summary
- `subject`: subject in kebab-case ASCII, 5 words max (e.g. `mcp-server-tokens-implementation`)

→ Announce the created file path to the user.
→ Ask them to run `/clear` to clear the context.

**Important**: never trigger `/clear` yourself — it is a user command.

### Phase 4 — RESUME (new session)

1. Call `load_session` without arguments to list available sessions
2. Present the list to the user (name + date + objective)
3. Wait for confirmation of which one to load
4. Call `load_session` with the confirmed file name
5. Inject the content as initial context for the session

## References

- All tools are available via the `context-manager` MCP server
- Tools: `estimate_tokens`, `summarize_context`, `suggest_cleanup`, `export_summary`, `load_session`
