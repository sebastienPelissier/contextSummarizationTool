import { describe, it, expect } from 'vitest';
import { analyzeCleanup } from './cleanup.js';

describe('analyzeCleanup — empty/clean text', () => {
  it('returns empty suggestions for clean short text', () => {
    const result = analyzeCleanup('This is a short session with no issues.');
    expect(result.suggestions).toHaveLength(0);
    expect(result.total_estimated_savings).toBe(0);
  });
});

describe('analyzeCleanup — code blocks', () => {
  it('detects a code block longer than 50 lines', () => {
    const longCode = '```typescript\n' + 'const x = 1;\n'.repeat(55) + '```';
    const result = analyzeCleanup(longCode);
    const codeBlockSuggestions = result.suggestions.filter(s => s.type === 'code_block');
    expect(codeBlockSuggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag code blocks under 50 lines', () => {
    const shortCode = '```typescript\n' + 'const x = 1;\n'.repeat(10) + '```';
    const result = analyzeCleanup(shortCode);
    const codeBlockSuggestions = result.suggestions.filter(s => s.type === 'code_block');
    expect(codeBlockSuggestions).toHaveLength(0);
  });

  it('detects N code blocks > 50 lines → at least N suggestions', () => {
    const longCode = '```typescript\n' + 'const x = 1;\n'.repeat(55) + '```';
    const text = longCode + '\n\nsome text\n\n' + longCode;
    const result = analyzeCleanup(text);
    const codeBlockSuggestions = result.suggestions.filter(s => s.type === 'code_block');
    expect(codeBlockSuggestions.length).toBeGreaterThanOrEqual(2);
  });
});

describe('analyzeCleanup — repeated content', () => {
  it('detects a paragraph that appears twice', () => {
    const repeatedBlock = 'This is a sufficiently long paragraph that appears more than once in the session text and should be detected as repeated content by the cleanup tool.';
    const text = repeatedBlock + '\n\nsome other content in the middle\n\n' + repeatedBlock;
    const result = analyzeCleanup(text);
    const repeated = result.suggestions.filter(s => s.type === 'repeated_content');
    expect(repeated.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag content that appears only once', () => {
    const text = 'Unique line one\nUnique line two\nUnique line three\n';
    const result = analyzeCleanup(text);
    const repeated = result.suggestions.filter(s => s.type === 'repeated_content');
    expect(repeated).toHaveLength(0);
  });
});

describe('analyzeCleanup — resolved errors', () => {
  it('detects an error block followed by a success marker', () => {
    const text = [
      'Error: Cannot find module ts-node',
      'npm install failed',
      '',
      'fixed the issue by installing dependencies',
      '✅ build successful',
    ].join('\n');
    const result = analyzeCleanup(text);
    const resolved = result.suggestions.filter(s => s.type === 'resolved_errors');
    expect(resolved.length).toBeGreaterThanOrEqual(1);
  });

  it('does NOT flag an error without a resolution', () => {
    const text = 'Error: Something went wrong\nStill broken\nNo fix yet';
    const result = analyzeCleanup(text);
    const resolved = result.suggestions.filter(s => s.type === 'resolved_errors');
    expect(resolved).toHaveLength(0);
  });
});

describe('analyzeCleanup — PBT properties', () => {
  it('total_estimated_savings equals sum of individual savings', () => {
    const longCode = '```typescript\n' + 'const x = 1;\n'.repeat(55) + '```';
    const result = analyzeCleanup(longCode);
    const sum = result.suggestions.reduce((acc, s) => acc + s.estimated_savings, 0);
    expect(result.total_estimated_savings).toBe(sum);
  });

  it('estimated_savings is always non-negative', () => {
    const longCode = '```typescript\n' + 'const x = 1;\n'.repeat(55) + '```';
    const result = analyzeCleanup(longCode);
    result.suggestions.forEach(s => {
      expect(s.estimated_savings).toBeGreaterThanOrEqual(0);
    });
  });

  it('total_estimated_savings never exceeds total token count of input', async () => {
    const { estimateTokens } = await import('../utils/tokenizer.js');
    const longCode = '```typescript\n' + 'const x = 1;\n'.repeat(55) + '```';
    const result = analyzeCleanup(longCode);
    expect(result.total_estimated_savings).toBeLessThanOrEqual(estimateTokens(longCode));
  });
});
