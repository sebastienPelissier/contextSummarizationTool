import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  normalizeSubject,
  formatDate,
  findAvailablePath,
  exportSummary,
} from './export.js';
import { resetConfig } from '../utils/config.js';

/** A structurally valid summary for export tests (agentic budget: ≤2000 tokens). */
const VALID_EXPORT_SUMMARY = `## Main Objective
Implement the MCP context manager server with 4 tools

## Decisions Made
- Used serveStdio over StdioServerTransport — reason: SDK v2 deprecates the latter
- Chose Markdown over YAML for session files: more readable, directly injectable as context

## Modified Files
- \`src/tools/export.ts\` — implements export_summary tool

## Next Steps
- Implement load_session tool (Task 6)

## Warnings
- estimateTokens underestimates for code-heavy sessions (chars/4 heuristic)

## Resume Here
Continue with load_session tool. Read design.md section on load_session for Input/Output spec.`;

let tmpDir: string;

beforeEach(() => {
  resetConfig();
});

afterEach(async () => {
  if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  resetConfig();
});

describe('normalizeSubject', () => {
  it('converts to kebab-case lowercase', () => {
    expect(normalizeSubject('Hello World')).toBe('hello-world');
  });

  it('removes accents', () => {
    expect(normalizeSubject('implémentation serveur MCP')).toBe('implementation-serveur-mcp');
  });

  it('removes special characters', () => {
    expect(normalizeSubject('test: something! (here)')).toBe('test-something-here');
  });

  it('limits to 5 words', () => {
    expect(normalizeSubject('one two three four five six seven')).toBe('one-two-three-four-five');
  });

  it('handles empty string', () => {
    expect(normalizeSubject('')).toBe('');
  });

  // PBT: never contains accents, spaces or special characters
  it('output never contains spaces or special chars', () => {
    const inputs = ['héllo wörld', 'test@123', 'a b c d e f g'];
    for (const input of inputs) {
      const result = normalizeSubject(input);
      expect(result).toMatch(/^[a-z0-9-]*$/);
    }
  });

  // PBT: at most 5 words separated by hyphens
  it('output contains at most 5 hyphen-separated words', () => {
    const result = normalizeSubject('one two three four five six seven eight');
    expect(result.split('-').length).toBeLessThanOrEqual(5);
  });
});

describe('formatDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-09-24'))).toBe('2026-09-24');
  });

  it('pads month and day with zeros', () => {
    expect(formatDate(new Date('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('findAvailablePath', () => {
  it('returns base path if file does not exist', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const path = join(tmpDir, 'session-2026-09-24-test.md');
    const result = await findAvailablePath(path);
    expect(result).toBe(path);
  });

  it('returns suffixed path if base exists', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const path = join(tmpDir, 'session-2026-09-24-test.md');
    // Create the base file
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, 'content');
    const result = await findAvailablePath(path);
    expect(result).toBe(join(tmpDir, 'session-2026-09-24-test-2.md'));
  });
});

describe('exportSummary', () => {
  it('creates the file with correct naming', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const fixedDate = new Date('2026-09-24');
    const result = await exportSummary('# Summary', 'impl mcp server', tmpDir, fixedDate);
    expect(result.file_path).toContain('session-2026-09-24-impl-mcp-server.md');
    expect(result.created).toBe(true);
  });

  it('creates the directory if absent', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const subDir = join(tmpDir, 'nested', 'context-summaries');
    await exportSummary('# Summary', 'test', subDir, new Date('2026-09-24'));
    const { existsSync } = await import('node:fs');
    expect(existsSync(subDir)).toBe(true);
  });

  it('writes the summary content to the file', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const content = '## Main Objective\nTest export';
    const result = await exportSummary(content, 'test', tmpDir, new Date('2026-09-24'));
    const written = await readFile(result.file_path, 'utf-8');
    expect(written).toBe(content);
  });

  it('includes validation result in the response (agentic mode)', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const result = await exportSummary('# Summary', 'test', tmpDir, new Date('2026-09-24'));
    expect(result.is_valid).toBeDefined();
    expect(result.warnings).toBeDefined();
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.estimated_tokens).toBeGreaterThan(0);
  });

  it('export always succeeds even when summary is invalid', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    // Summary with no mandatory sections — invalid but export must succeed
    const result = await exportSummary('No sections here.', 'test', tmpDir, new Date('2026-09-24'));
    expect(result.created).toBe(true);
    expect(result.is_valid).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
    const { existsSync } = await import('node:fs');
    expect(existsSync(result.file_path)).toBe(true);
  });

  it('agentic budget (2000 tokens) applied — valid summary within budget has no budget warning', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const result = await exportSummary(VALID_EXPORT_SUMMARY, 'test', tmpDir, new Date('2026-09-24'));
    expect(result.warnings.some(w => w.includes('token budget'))).toBe(false);
  });

  // PBT: anti-overwrite — two successive calls produce different paths
  it('two successive calls with same subject produce different paths', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const date = new Date('2026-09-24');
    const r1 = await exportSummary('# Summary 1', 'test', tmpDir, date);
    const r2 = await exportSummary('# Summary 2', 'test', tmpDir, date);
    expect(r1.file_path).not.toBe(r2.file_path);
  });

  // PBT: file always exists after successful call
  it('created file always exists on filesystem', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const result = await exportSummary('# Summary', 'test', tmpDir, new Date('2026-09-24'));
    const { existsSync } = await import('node:fs');
    expect(existsSync(result.file_path)).toBe(true);
  });

  it('uses session as default subject when none provided', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-test-'));
    const result = await exportSummary('# Summary', undefined, tmpDir, new Date('2026-09-24'));
    expect(result.file_path).toContain('session-2026-09-24-session.md');
  });
});
