import * as z from 'zod/v4';
import { estimateTokens } from '../utils/tokenizer.js';

export const suggestCleanupSchema = z.object({
  session_text: z.string().min(1, 'session_text cannot be empty'),
});

export type SuggestionType =
  | 'code_block'
  | 'repeated_content'
  | 'resolved_errors'
  | 'verbose_output';

export interface CleanupSuggestion {
  type: SuggestionType;
  description: string;
  estimated_savings: number;
}

export interface CleanupResult {
  suggestions: CleanupSuggestion[];
  total_estimated_savings: number;
}

const CODE_BLOCK_MIN_LINES = 50;
const VERBOSE_OUTPUT_MIN_LINES = 30;

/** Minimum characters for a paragraph to be considered for repetition detection. */
const REPEATED_CONTENT_MIN_CHARS = 120;

/**
 * Detects code blocks longer than CODE_BLOCK_MIN_LINES lines.
 */
function detectCodeBlocks(text: string): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const content = match[1] ?? '';
    const lineCount = content.split('\n').length;
    if (lineCount > CODE_BLOCK_MIN_LINES) {
      const savings = estimateTokens(match[0]);
      suggestions.push({
        type: 'code_block',
        description:
          `Code block of ${lineCount} lines — likely already integrated into a file. ` +
          `Consider removing it from context.`,
        estimated_savings: savings,
      });
    }
  }

  return suggestions;
}

function extractParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(p => p.length >= REPEATED_CONTENT_MIN_CHARS);
}

function detectRepeatedContent(text: string): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const paragraphs = extractParagraphs(text);
  const seen = new Map<string, number>();

  for (const paragraph of paragraphs) {
    const count = (seen.get(paragraph) ?? 0) + 1;
    seen.set(paragraph, count);

    if (count === 2) {
      const savings = estimateTokens(paragraph);
      suggestions.push({
        type: 'repeated_content',
        description:
          `Paragraph appears at least twice: "${paragraph.slice(0, 80)}..." ` +
          `One occurrence can be removed.`,
        estimated_savings: savings,
      });
    }
  }

  return suggestions;
}

function detectResolvedErrors(text: string): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const errorPattern = /(?:^|\n)((?:Error:|❌|FAILED|error TS\d+)[^\n]*(?:\n(?![✅]|Success|PASSED)[^\n]*){0,5})/gm;
  const successMarkers = ['✅', 'Success', 'PASSED', 'fixed', 'resolved', 'working'];

  let match: RegExpExecArray | null;
  while ((match = errorPattern.exec(text)) !== null) {
    const errorBlock = match[1] ?? '';
    const afterError = text.slice((match.index ?? 0) + errorBlock.length);
    const isResolved = successMarkers.some(marker =>
      afterError.slice(0, 2000).toLowerCase().includes(marker.toLowerCase()),
    );

    if (isResolved) {
      const savings = estimateTokens(errorBlock);
      suggestions.push({
        type: 'resolved_errors',
        description:
          `Error block appears to be resolved later in session: ` +
          `"${errorBlock.trim().slice(0, 80)}..."`,
        estimated_savings: savings,
      });
    }
  }

  return suggestions;
}

function detectVerboseOutput(text: string): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];
  const outputBlockRegex = /(?:(?:^\$|^>|\s{2,}\w+\s+\w+\s+\d+)[^\n]*\n){10,}/gm;
  let match: RegExpExecArray | null;

  while ((match = outputBlockRegex.exec(text)) !== null) {
    const block = match[0];
    const lineCount = block.split('\n').length;
    if (lineCount >= VERBOSE_OUTPUT_MIN_LINES) {
      const savings = estimateTokens(block);
      suggestions.push({
        type: 'verbose_output',
        description:
          `Command output of ${lineCount} lines — likely a directory listing or build log ` +
          `that has already been processed.`,
        estimated_savings: savings,
      });
    }
  }

  return suggestions;
}

export function analyzeCleanup(sessionText: string): CleanupResult {
  const suggestions: CleanupSuggestion[] = [
    ...detectCodeBlocks(sessionText),
    ...detectRepeatedContent(sessionText),
    ...detectResolvedErrors(sessionText),
    ...detectVerboseOutput(sessionText),
  ];

  const total_estimated_savings = suggestions.reduce(
    (sum, s) => sum + s.estimated_savings,
    0,
  );

  return { suggestions, total_estimated_savings };
}

export async function handleSuggestCleanup(
  input: z.infer<typeof suggestCleanupSchema>,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const result = analyzeCleanup(input.session_text);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    console.error('[suggest_cleanup]', error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
