/**
 * summarize_context tool — validates and structures a session summary.
 *
 * Does NOT generate a summary from raw session text.
 * The agent writes the draft; this tool validates format and flags issues.
 */

import * as z from 'zod/v4';
import { estimateTokens, isWithinTokenBudget, MAX_SUMMARY_TOKENS } from '../utils/tokenizer.js';

/** The 6 mandatory sections every exported summary must contain. */
const MANDATORY_SECTIONS = [
  '## Main Objective',
  '## Decisions Made',
  '## Modified Files',
  '## Next Steps',
  '## Warnings',
  '## Resume Here',
] as const;

/** Hollow phrases that indicate a section was not properly filled. */
const HOLLOW_PHRASES = new Set([
  'n/a', 'na', 'tbd', 'todo', 'nothing', 'none', 'see later',
  '-', '???', 'not applicable', 'continue where we left off',
  'continue from where we left off', 'pick up where we left off',
]);

export const summarizeContextSchema = z.object({
  draft_summary: z.string().min(1, 'draft_summary cannot be empty'),
});

export interface SummarizeResult {
  summary: string;
  is_valid: boolean;
  warnings: string[];
  estimated_tokens: number;
}

/**
 * Checks if a string contains only hollow content (empty, placeholder, or generic phrase).
 */
function isHollow(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (normalized.length === 0) return true;
  return HOLLOW_PHRASES.has(normalized);
}

/**
 * Extracts the content of a section from a Markdown summary.
 * Returns empty string if the section is absent.
 */
function extractSection(text: string, sectionHeader: string): string {
  const escaped = sectionHeader.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
  const match = regex.exec(text);
  return match?.[1]?.trim() ?? '';
}

/**
 * Checks if a Decisions Made section contains at least one decision with reasoning.
 * A decision has reasoning if it contains " — ", " because ", " since ", or ": ".
 */
function hasDecisionWithReasoning(decisionsContent: string): boolean {
  if (!decisionsContent) return false;
  const lines = decisionsContent.split('\n').filter(l => l.trim().startsWith('-'));
  return lines.some(line =>
    line.includes(' — ') ||
    line.includes(' because ') ||
    line.includes(' since ') ||
    line.includes(' reason:') ||
    /:\s+\w/.test(line),
  );
}

/**
 * Validates and structures an agent-written session summary.
 * Does not generate content — validates format and flags hollow phrases.
 */
export function validateSummary(draftSummary: string): SummarizeResult {
  const warnings: string[] = [];

  // Check mandatory sections presence
  for (const section of MANDATORY_SECTIONS) {
    if (!draftSummary.includes(section)) {
      warnings.push(`Missing mandatory section: ${section}`);
    }
  }

  // Check Main Objective is specific (≥ 3 words)
  const objective = extractSection(draftSummary, '## Main Objective');
  if (objective.length === 0) {
    warnings.push('## Main Objective is empty');
  } else if (isHollow(objective)) {
    warnings.push(`## Main Objective contains a hollow phrase: "${objective}"`);
  } else if (objective.split(/\s+/).filter(Boolean).length < 3) {
    warnings.push('## Main Objective must be at least 3 words (too generic)');
  }

  // Check Resume Here is not generic
  const resumeHere = extractSection(draftSummary, '## Resume Here');
  if (resumeHere.length === 0) {
    warnings.push('## Resume Here is empty — must contain a concrete first prompt');
  } else if (isHollow(resumeHere)) {
    warnings.push(`## Resume Here contains a hollow phrase: "${resumeHere}"`);
  }

  // Check Decisions Made has at least one decision with reasoning
  const decisions = extractSection(draftSummary, '## Decisions Made');
  if (decisions.length > 0 && !isHollow(decisions) && !hasDecisionWithReasoning(decisions)) {
    warnings.push(
      '## Decisions Made: at least one decision must include reasoning (use " — reason" format)',
    );
  }

  const estimated_tokens = estimateTokens(draftSummary);

  if (!isWithinTokenBudget(draftSummary, MAX_SUMMARY_TOKENS)) {
    warnings.push(
      `Summary exceeds ${MAX_SUMMARY_TOKENS} tokens (estimated: ${estimated_tokens}). ` +
      'Shorten verbose sections before exporting.',
    );
  }

  return {
    summary: draftSummary,
    is_valid: warnings.length === 0,
    warnings,
    estimated_tokens,
  };
}

/** MCP tool handler for summarize_context. */
export async function handleSummarizeContext(
  input: z.infer<typeof summarizeContextSchema>,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const result = validateSummary(input.draft_summary);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    console.error('[summarize_context]', error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
