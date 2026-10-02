/**
 * Token estimation utility for the mcp-context-manager.
 * Internal utility — NOT an exposed MCP tool.
 *
 * Used by summarize_context (validates token budget by mode)
 * and suggest_cleanup (estimates savings per suggestion).
 */

/**
 * Estimates the number of tokens in a text using the chars/4 heuristic.
 * Accuracy ±15% compared to real GPT/Claude tokenizers.
 *
 * Known behavior:
 * - English prose: ~±10% accuracy
 * - Code: tends to underestimate (tokens per char is higher for code)
 * - Unicode / non-Latin scripts: underestimates significantly
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Returns true if the text is within the token budget.
 */
export function isWithinTokenBudget(text: string, maxTokens: number): boolean {
  return estimateTokens(text) <= maxTokens;
}

/** Maximum tokens allowed for an exported session summary — conversational mode. */
export const CONVERSATIONAL_TOKEN_BUDGET = 1000;

/** Maximum tokens allowed for an exported session summary — agentic mode. */
export const AGENTIC_TOKEN_BUDGET = 2000;
