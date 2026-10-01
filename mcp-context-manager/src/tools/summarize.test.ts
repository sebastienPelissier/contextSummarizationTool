import { describe, it, expect } from 'vitest';
import { validateSummary } from './summarize.js';

const VALID_SUMMARY = `## Main Objective
Implement the MCP context manager server with 4 tools

## Decisions Made
- Used serveStdio over StdioServerTransport — reason: SDK v2 deprecates the latter
- Chose Markdown over YAML for session files: more readable, directly injectable as context

## Modified Files
- \`src/tools/summarize.ts\` — implements summarize_context tool
- \`src/utils/tokenizer.ts\` — internal token estimation utility

## Next Steps
- Implement export_summary tool (Task 5)
- Implement load_session tool (Task 6)

## Warnings
- estimateTokens underestimates for code-heavy sessions (chars/4 heuristic)

## Resume Here
Continue implementation of export_summary tool. Read design.md section on export_summary for Input/Output spec before starting.`;

describe('validateSummary — valid summary', () => {
  it('returns is_valid: true for a well-formed summary', () => {
    const result = validateSummary(VALID_SUMMARY);
    expect(result.is_valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns the summary unchanged', () => {
    const result = validateSummary(VALID_SUMMARY);
    expect(result.summary).toBe(VALID_SUMMARY);
  });

  it('returns estimated_tokens > 0', () => {
    const result = validateSummary(VALID_SUMMARY);
    expect(result.estimated_tokens).toBeGreaterThan(0);
  });
});

describe('validateSummary — missing sections', () => {
  it('flags missing ## Main Objective', () => {
    const text = VALID_SUMMARY.replace('## Main Objective', '## REMOVED');
    const result = validateSummary(text);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.some(w => w.includes('## Main Objective'))).toBe(true);
  });

  it('flags missing ## Resume Here', () => {
    const text = VALID_SUMMARY.replace('## Resume Here', '## REMOVED');
    const result = validateSummary(text);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.some(w => w.includes('## Resume Here'))).toBe(true);
  });

  it('flags all 6 missing sections', () => {
    const result = validateSummary('No sections here at all.');
    expect(result.is_valid).toBe(false);
    expect(result.warnings.filter(w => w.startsWith('Missing mandatory section')).length).toBe(6);
  });
});

describe('validateSummary — hollow phrases', () => {
  it('flags hollow Main Objective: n/a', () => {
    const text = VALID_SUMMARY.replace(
      'Implement the MCP context manager server with 4 tools',
      'n/a',
    );
    const result = validateSummary(text);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.some(w => w.includes('hollow phrase'))).toBe(true);
  });

  it('flags hollow Resume Here: "continue where we left off"', () => {
    const text = VALID_SUMMARY.replace(
      /## Resume Here\n[\s\S]*/,
      '## Resume Here\ncontinue where we left off',
    );
    const result = validateSummary(text);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.some(w => w.includes('## Resume Here'))).toBe(true);
  });
});

describe('validateSummary — Main Objective too short', () => {
  it('flags a 1-word objective', () => {
    const text = VALID_SUMMARY.replace(
      'Implement the MCP context manager server with 4 tools',
      'Implementation',
    );
    const result = validateSummary(text);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.some(w => w.includes('at least 3 words'))).toBe(true);
  });

  it('accepts a 3-word objective', () => {
    const text = VALID_SUMMARY.replace(
      'Implement the MCP context manager server with 4 tools',
      'Implement MCP server',
    );
    const result = validateSummary(text);
    // Only check that the "too short" warning is NOT present
    expect(result.warnings.some(w => w.includes('at least 3 words'))).toBe(false);
  });
});

describe('validateSummary — decisions without reasoning', () => {
  it('flags decisions without any reasoning', () => {
    const text = VALID_SUMMARY.replace(
      '- Used serveStdio over StdioServerTransport — reason: SDK v2 deprecates the latter\n- Chose Markdown over YAML for session files: more readable, directly injectable as context',
      '- Used serveStdio\n- Chose Markdown',
    );
    const result = validateSummary(text);
    expect(result.warnings.some(w => w.includes('reasoning'))).toBe(true);
  });
});

describe('validateSummary — PBT properties', () => {
  it('is_valid true iff no warnings', () => {
    const valid = validateSummary(VALID_SUMMARY);
    expect(valid.is_valid).toBe(valid.warnings.length === 0);

    const invalid = validateSummary('No sections');
    expect(invalid.is_valid).toBe(invalid.warnings.length === 0);
  });

  it('estimated_tokens is always positive for non-empty input', () => {
    const result = validateSummary(VALID_SUMMARY);
    expect(result.estimated_tokens).toBeGreaterThan(0);
  });
});
