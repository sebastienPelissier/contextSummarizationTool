# Context Manager — Steering

When this Power is active, always apply these rules.

## Context thresholds

```
< 60%  → ok       — no action needed
60–80% → warning  — trigger the context-export workflow
> 80%  → critical — immediate export before context loss
```

## Expected behavior

- Always use `estimate_tokens` before suggesting a summary
- Always include a `## Resume Here` section in exports
- Never overwrite an existing session file — suffix with `-2`, `-3`
- Never trigger `/clear` yourself — inform the user and ask them to do it

## Session file naming

Format: `session-YYYY-MM-DD-<subject>.md`
- subject in kebab-case ASCII, 5 words max, no accents
- Example: `session-2026-09-24-mcp-server-implementation.md`
