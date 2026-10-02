import { describe, it, expect } from 'vitest';
import { estimateTokens, isWithinTokenBudget, CONVERSATIONAL_TOKEN_BUDGET, AGENTIC_TOKEN_BUDGET } from './tokenizer.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns ceiling of chars/4 for short text', () => {
    expect(estimateTokens('abcd')).toBe(1);   // 4/4 = 1
    expect(estimateTokens('abcde')).toBe(2);  // 5/4 = 1.25 → ceil = 2
  });

  it('returns correct estimate for longer text', () => {
    const text = 'a'.repeat(400);
    expect(estimateTokens(text)).toBe(100);
  });

  it('always returns non-negative value', () => {
    expect(estimateTokens('')).toBeGreaterThanOrEqual(0);
    expect(estimateTokens('hello')).toBeGreaterThanOrEqual(0);
  });

  it('is monotonically non-decreasing (concatenation property)', () => {
    const a = 'hello world';
    const b = ' more text here';
    expect(estimateTokens(a + b)).toBeGreaterThanOrEqual(estimateTokens(a));
  });

  it('is exactly linear for repetitions', () => {
    const base = 'abcd'; // exactly 1 token
    expect(estimateTokens(base.repeat(5))).toBe(estimateTokens(base) * 5);
  });

  it('handles Unicode text (may underestimate but never negative)', () => {
    const unicode = '你好世界'; // 4 Chinese characters
    expect(estimateTokens(unicode)).toBeGreaterThanOrEqual(0);
    expect(estimateTokens(unicode)).toBeLessThanOrEqual(unicode.length); // chars/4 ≤ chars
  });
});

describe('isWithinTokenBudget', () => {
  it('returns true when text is within budget', () => {
    const text = 'a'.repeat(100); // 25 tokens
    expect(isWithinTokenBudget(text, 50)).toBe(true);
  });

  it('returns false when text exceeds budget', () => {
    const text = 'a'.repeat(400); // 100 tokens
    expect(isWithinTokenBudget(text, 50)).toBe(false);
  });

  it('returns true when exactly at budget', () => {
    const text = 'a'.repeat(200); // 50 tokens
    expect(isWithinTokenBudget(text, 50)).toBe(true);
  });
});

describe('token budgets', () => {
  it('CONVERSATIONAL_TOKEN_BUDGET is 1000', () => {
    expect(CONVERSATIONAL_TOKEN_BUDGET).toBe(1000);
  });

  it('AGENTIC_TOKEN_BUDGET is 2000', () => {
    expect(AGENTIC_TOKEN_BUDGET).toBe(2000);
  });

  it('agentic budget is double the conversational budget', () => {
    expect(AGENTIC_TOKEN_BUDGET).toBe(CONVERSATIONAL_TOKEN_BUDGET * 2);
  });
});
