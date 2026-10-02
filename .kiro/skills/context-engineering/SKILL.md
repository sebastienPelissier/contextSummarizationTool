---
name: document-and-clear
description: >
  Transparent AI session context management: alternative to /compact that avoids the "black box".
  Use this skill when: (1) the context window approaches 60%, (2) context rot signals appear
  (API hallucinations, forgotten conventions, error loops, inconsistent code),
  (3) before closing a session to preserve decisions and project state, (4) to start
  a new session resuming where the previous one left off.
  Triggers: "document and clear", "documente et clear", "save context", "new session",
  "context saturated", "context rot", "60% context".
license: Apache-2.0
metadata:
  author: "spelissier"
  version: "2.1"
  tags: [context-engineering, context-management, session, document-and-clear, compact]
---

# Document and Clear

Transparent alternative to `/compact`: you control exactly what is kept.

> Model = CPU. Context window = RAM. Your role = the OS that loads only what is necessary.

## When to Trigger

You have no introspective access to your own context usage percentage. Never invent it
or estimate it by guesswork.

1. **`/context` launched by the user** → the only exact and reliable source: the result (tokens
  used/total, %) displays directly in the conversation and you can read it as-is. If you
  suspect an advanced session (points 2-3 below) without knowing for sure, suggest that the
  user run `/context` rather than guessing. Act as soon as it shows ≥60%.
2. **Active review of recent exchanges** (not a % measurement, a quality proxy): if you
  spot yourself, by reviewing your recent tool-calls/messages, an error you're repeating or a
  contradiction with what you produced earlier in the session, it's a sufficient signal to
  trigger regardless of the actual percentage, but it's not reliably correlated with
  context fill level (it can happen at 20% as well as 90%).
3. **Volume heuristic** (not a % measurement, an even weaker proxy): long session
  (>30 exchanges), many large files read/re-read, multiple sub-agents launched in the session
  → suspect the context is advanced and suggest `/context` to the user to verify,
  rather than triggering directly based on this alone.

If no signal is present, do not trigger preventively: the cost of an unnecessary `document-and-clear` (time, interruption) is not zero.

**Emergency: user requests immediate `/clear` without documenting**: it's not this skill's job to block a direct request. Warn once, in one sentence, about information loss (decisions and session state not preserved), then comply if the user confirms.

## Workflow

### Phase 1: DOCUMENT

1. Load `.kiro/skill/context-engineering/references/session-template.md` as base.
2. Fill the template with the actual session state: completed/pending tasks, architectural
  decisions + their reason (the "why" is critical), key files created/modified,
  instructions for the next session. All sections are recommended for completeness, but only
  the 6 core sections are validated as mandatory: Main Objective, Decisions Made, Modified Files,
  Next Steps, Warnings, Resume Here.
  Choose a `summary_mode` based on session weight:
  - `conversational` (default): target ≤ 1 000 tokens — short/medium sessions, recent chat context
  - `agentic`: target ≤ 2 000 tokens — heavy sessions with sub-agents or large file analysis
  Never exceed 2 000 tokens: beyond that, noise is reintroduced and the next session suffers
  attention loss ("Lost in the Middle"). The summary should represent at most 5–10% of your
  available context budget.
3. Choose the filename: `context-summaries/session-YYYY-MM-DD-<subject>.md`, `<subject>` in
   kebab-case ASCII (lowercase, hyphens, no accents, 5 words max, e.g., `stripe-payment-refactor`).
   If a file with the same name already exists, never overwrite: suffix with `-2`, `-3`, etc.
   If `context-summaries/` doesn't exist yet in the project, create it and verify it's listed
   in the `.gitignore` of the target project (add it otherwise) — this folder may contain
   sensitive information in plain text and is not intended to be versioned by default.
4. Validate the file before continuing. Resolve `<skill-path>` using the directory
  containing this SKILL.md (varies by installation: project, user, or plugin):  
  ```bash
  python3 <skill-path>/scripts/validate_session_doc.py context-summaries/session-YYYY-MM-DD-<subject>.md
  ```
   - **Exit 1** (fields to correct): complete the flagged fields in the document and re-run.
   - **Exit 2** (environment or structure error: missing dependency, invalid path,
    malformed YAML): this is not a field to fill, don't loop indefinitely. Diagnose the
    cause (e.g., `pip install pyyaml`, correct the path); if not immediately resolvable, inform
    the user of the blocker and offer to continue without automatic validation rather than
    staying stuck.
   - **Exit 0**: proceed to Phase 2.

The script catches unreplaced template placeholders and obvious hollow phrases
(`N/A`, `TBD`…) on the most critical fields, but cannot guarantee the actual content quality.
The fixed YAML structure reduces the risk of hollow summary, but doesn't eliminate it.

### Phase 2: CLEAR

Only after successful validation: announce to the user the path of the saved file and
ask them to run `/clear`. This is a CLI command the user executes; the agent cannot
trigger it itself.

### Phase 3: RESUME

In the new session, locate files in `context-summaries/`. If there are multiple,
do not silently load "the most recent" by mtime: list available files to the
user (name + date) and ask them to confirm which one to resume, unless they've already named the
subject in their request. Then load the confirmed file, followed by files listed in
`next_session.load_files`.

## References

- `.kiro/skill/context-engineering/references/session-template.md`, Markdown template to use for each session summary
- `.kiro/skill/context-engineering/references/document-template.yaml`, YAML template (alternative format)
