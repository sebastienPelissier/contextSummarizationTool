/**
 * load_session tool — lists and loads previous session summary files.
 *
 * Without file_name: lists available sessions with date + extracted objective.
 * With file_name: returns file content ready to inject as context.
 *
 * Never silently loads the most recent file — always lists and lets the user confirm.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as z from 'zod/v4';
import { getConfig } from '../utils/config.js';

export const loadSessionSchema = z.object({
  file_name: z.string().optional(),
  sessions_dir: z.string().optional(),
});

export interface SessionEntry {
  file_name: string;
  date: string;
  subject: string;
  objective: string;
}

export interface ListSessionsResult {
  sessions: SessionEntry[];
}

export interface LoadSessionResult {
  file_name: string;
  content: string;
}

/**
 * Extracts the objective from a session file's ## Main Objective section.
 * Returns the first non-empty line of the section, or empty string if absent.
 */
export function extractObjective(content: string): string {
  const match = /## Main Objective[ \t]*\n([\s\S]*?)(?=\n{0,2}## |$)/i.exec(content);
  if (!match?.[1]) return '';
  const lines = match[1].split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
  return lines[0] ?? '';
}

/**
 * Parses the date and subject from a session file name.
 * Expected format: session-YYYY-MM-DD-<subject>[-N].md
 */
export function parseFileName(fileName: string): { date: string; subject: string } {
  const match = /^session-(\d{4}-\d{2}-\d{2})-(.+)\.md$/.exec(fileName);
  if (!match) return { date: '', subject: fileName };
  const date = match[1] ?? '';
  const subject = (match[2] ?? '').replace(/-\d+$/, '').replace(/-/g, ' ');
  return { date, subject };
}

/**
 * Lists all session files in the sessions directory.
 * Uses the sessions_dir from the loaded configuration.
 * Returns empty list if directory does not exist — never throws.
 */
export async function listSessions(sessionsDir?: string): Promise<ListSessionsResult> {
  const config = await getConfig();
  const dir = sessionsDir ?? config.paths.sessions_dir;

  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    // Directory does not exist — return empty list
    return { sessions: [] };
  }

  const mdFiles = files.filter(f => f.endsWith('.md')).sort();
  const sessions: SessionEntry[] = [];

  for (const file of mdFiles) {
    try {
      const content = await readFile(join(dir, file), 'utf-8');
      const { date, subject } = parseFileName(file);
      const objective = extractObjective(content);
      sessions.push({ file_name: file, date, subject, objective });
    } catch {
      // Skip unreadable files
    }
  }

  return { sessions };
}

/**
 * Loads a specific session file by name.
 * Uses the sessions_dir from the loaded configuration.
 * Returns an MCP error if the file does not exist — never crashes.
 */
export async function loadSession(
  fileName: string,
  sessionsDir?: string,
): Promise<LoadSessionResult> {
  const config = await getConfig();
  const dir = sessionsDir ?? config.paths.sessions_dir;
  const filePath = join(dir, fileName);
  const content = await readFile(filePath, 'utf-8');
  return { file_name: fileName, content };
}

/** MCP tool handler for load_session. */
export async function handleLoadSession(
  input: z.infer<typeof loadSessionSchema>,
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  try {
    if (input.file_name) {
      const result = await loadSession(input.file_name, input.sessions_dir);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } else {
      const result = await listSessions(input.sessions_dir);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
  } catch (error) {
    console.error('[load_session]', error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
}
