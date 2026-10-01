/**
 * export_summary tool — saves a validated session summary to a Markdown file.
 *
 * Naming: session-YYYY-MM-DD-<subject>.md
 * Anti-overwrite: suffixes -2, -3, etc. if file already exists.
 * Directory created automatically if absent.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod/v4';
import { getConfig } from '../utils/config.js';

export const exportSummarySchema = z.object({
  summary: z.string().min(1, 'summary cannot be empty'),
  subject: z.string().optional(),
  output_dir: z.string().optional(),
});

export interface ExportResult {
  file_path: string;
  created: boolean;
}
const MAX_SUBJECT_WORDS = 5;

/**
 * Normalizes a subject string to kebab-case ASCII (max 5 words, no accents/special chars).
 */
export function normalizeSubject(subject: string): string {
  return subject
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // keep only alphanumeric, spaces, hyphens
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SUBJECT_WORDS)
    .join('-');
}

/**
 * Formats a Date as YYYY-MM-DD.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Checks if a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Finds an available file path, suffixing -2, -3, etc. if the base name already exists.
 */
export async function findAvailablePath(basePath: string): Promise<string> {
  if (!(await fileExists(basePath))) return basePath;

  const dotIndex = basePath.lastIndexOf('.');
  const base = basePath.slice(0, dotIndex);
  const ext = basePath.slice(dotIndex);

  for (let i = 2; i <= 999; i++) {
    const candidate = `${base}-${i}${ext}`;
    if (!(await fileExists(candidate))) return candidate;
  }

  throw new Error(`Could not find an available path for ${basePath} after 999 attempts`);
}

/**
 * Exports a session summary to a timestamped Markdown file.
 * Uses the sessions_dir from the loaded configuration.
 */
export async function exportSummary(
  summary: string,
  subject?: string,
  outputDir?: string,
  date?: Date,
): Promise<ExportResult> {
  const config = await getConfig();
  const dir = outputDir ?? config.paths.sessions_dir;
  const dateStr = formatDate(date ?? new Date());
  const normalizedSubject = subject ? normalizeSubject(subject) : 'session';
  const fileName = `session-${dateStr}-${normalizedSubject}.md`;
  const basePath = join(dir, fileName);

  await mkdir(dir, { recursive: true });
  const filePath = await findAvailablePath(basePath);
  await writeFile(filePath, summary, 'utf-8');

  return { file_path: filePath, created: true };
}

/** MCP tool handler for export_summary. */
export async function handleExportSummary(
  input: z.infer<typeof exportSummarySchema>,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    const result = await exportSummary(input.summary, input.subject, input.output_dir);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    console.error('[export_summary]', error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
