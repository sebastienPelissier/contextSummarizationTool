import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractObjective, parseFileName, listSessions, loadSession } from './load.js';
import { resetConfig } from '../utils/config.js';

let tmpDir: string;

beforeEach(() => {
  resetConfig();
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  resetConfig();
});

describe('extractObjective', () => {
  it('extracts first line of ## Main Objective', () => {
    const content = `## Main Objective\nImplement MCP server with 4 tools\n\n## Decisions Made\n`;
    expect(extractObjective(content)).toBe('Implement MCP server with 4 tools');
  });

  it('returns empty string if section is absent', () => {
    expect(extractObjective('No sections here')).toBe('');
  });

  it('handles empty section', () => {
    const content = `## Main Objective\n\n## Decisions Made\n`;
    expect(extractObjective(content)).toBe('');
  });
});

describe('parseFileName', () => {
  it('parses date and subject from standard filename', () => {
    const result = parseFileName('session-2026-09-24-impl-mcp-server.md');
    expect(result.date).toBe('2026-09-24');
    expect(result.subject).toBe('impl mcp server');
  });

  it('strips trailing numeric suffix from subject', () => {
    const result = parseFileName('session-2026-09-24-impl-mcp-server-2.md');
    expect(result.subject).toBe('impl mcp server');
  });

  it('returns filename as subject for non-standard filenames', () => {
    const result = parseFileName('random-file.md');
    expect(result.date).toBe('');
    expect(result.subject).toBe('random-file.md');
  });
});

describe('listSessions', () => {
  it('returns empty list for non-existent directory', async () => {
    const result = await listSessions('/non/existent/path');
    expect(result.sessions).toHaveLength(0);
  });

  it('returns empty list for empty directory', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const result = await listSessions(tmpDir);
    expect(result.sessions).toHaveLength(0);
  });

  it('lists session files with extracted metadata', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const content = `## Main Objective\nTest the load session tool\n\n## Resume Here\nContinue.`;
    await writeFile(join(tmpDir, 'session-2026-09-24-test-session.md'), content, 'utf-8');

    const result = await listSessions(tmpDir);
    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]?.file_name).toBe('session-2026-09-24-test-session.md');
    expect(result.sessions[0]?.date).toBe('2026-09-24');
    expect(result.sessions[0]?.objective).toBe('Test the load session tool');
  });

  // PBT: N files exported → listSessions returns N sessions
  it('returns exactly N sessions for N files', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const N = 3;
    for (let i = 1; i <= N; i++) {
      await writeFile(
        join(tmpDir, `session-2026-09-24-test-${i}.md`),
        `## Main Objective\nTest ${i}\n## Resume Here\nContinue.`,
        'utf-8',
      );
    }
    const result = await listSessions(tmpDir);
    expect(result.sessions).toHaveLength(N);
  });
});

describe('loadSession', () => {
  it('loads file content by name', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const content = '## Main Objective\nTest load';
    await writeFile(join(tmpDir, 'session-2026-09-24-test.md'), content, 'utf-8');

    const result = await loadSession('session-2026-09-24-test.md', tmpDir);
    expect(result.content).toBe(content);
    expect(result.file_name).toBe('session-2026-09-24-test.md');
  });

  // PBT: exported then loaded → content identical
  it('content loaded matches content written', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const content = '## Main Objective\nRound-trip test';
    await writeFile(join(tmpDir, 'session-2026-09-24-roundtrip.md'), content, 'utf-8');
    const result = await loadSession('session-2026-09-24-roundtrip.md', tmpDir);
    expect(result.content).toBe(content);
  });

  // PBT: non-existent file → throws (MCP handler catches it)
  it('throws for non-existent file', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    await expect(loadSession('non-existent.md', tmpDir)).rejects.toThrow();
  });
});
