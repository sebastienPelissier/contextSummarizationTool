import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, getConfig, resetConfig, type McpConfig } from './config.js';

describe('config loader', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'mcp-config-test-'));
    resetConfig();
  });

  afterEach(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
    resetConfig();
  });

  describe('loadConfig', () => {
    it('should load default.json when no env var is set', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;
      delete process.env.KIRO_SESSION_ID;
      delete process.env.CLAUDE_SESSION_ID;

      const config = await loadConfig();

      expect(config.tool).toBe('generic');
      expect(config.paths.sessions_dir).toBe('./context-summaries');
      expect(config.thresholds.warning).toBe(0.60);
      expect(config.thresholds.critical).toBe(0.80);
    });

    it('should load kiro.json when MCP_CONTEXT_CONFIG=kiro', async () => {
      process.env.MCP_CONTEXT_CONFIG = 'kiro';

      const config = await loadConfig();

      expect(config.tool).toBe('kiro');
      expect(config.paths.sessions_dir).toBe('./context-summaries');
      expect(config.paths.session_id_file).toBe('.kiro/.session-id');
      expect(config.hooks.context_check.type).toBe('cli');
      expect(config.hooks.context_check.output_regex).toContain('Context breakdown');
    });

    it('should load claude-code.json when MCP_CONTEXT_CONFIG=claude-code', async () => {
      process.env.MCP_CONTEXT_CONFIG = 'claude-code';

      const config = await loadConfig();

      expect(config.tool).toBe('claude-code');
      expect(config.paths.sessions_dir).toBe('./context-summaries');
      expect(config.paths.session_id_file).toBe('.claude/.session-id');
      expect(config.hooks.context_check.type).toBe('cli');
      expect(config.hooks.context_check.output_regex).toContain('Tokens');
    });

    it('should load custom config from absolute path', async () => {
      const customConfig: McpConfig = {
        tool: 'custom',
        paths: {
          sessions_dir: './custom-sessions',
          session_id_file: null,
        },
        hooks: {
          session_id_capture: {
            command: null,
            output_file: null,
            description: 'Custom tool',
          },
          context_check: {
            type: 'estimation',
            command: null,
            output_regex: null,
            description: 'Manual checks',
          },
        },
        thresholds: {
          warning: 0.50,
          critical: 0.75,
        },
      };

      const customPath = join(tmpDir, 'custom.json');
      await writeFile(customPath, JSON.stringify(customConfig), 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = customPath;

      const config = await loadConfig();

      expect(config.tool).toBe('custom');
      expect(config.paths.sessions_dir).toBe('./custom-sessions');
      expect(config.thresholds.warning).toBe(0.50);
      expect(config.thresholds.critical).toBe(0.75);
    });

    it('should auto-detect kiro from KIRO_SESSION_ID env var', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;
      process.env.KIRO_SESSION_ID = 'test-session-id';

      const config = await loadConfig();

      expect(config.tool).toBe('kiro');
    });

    it('should auto-detect kiro from KIRO_AGENT env var', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;
      process.env.KIRO_AGENT = 'true';

      const config = await loadConfig();

      expect(config.tool).toBe('kiro');
    });

    it('should auto-detect claude-code from CLAUDE_SESSION_ID env var', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;
      delete process.env.KIRO_SESSION_ID;
      process.env.CLAUDE_SESSION_ID = 'test-claude-session';

      const config = await loadConfig();

      expect(config.tool).toBe('claude-code');
    });

    it('should auto-detect claude-code from ANTHROPIC_API_KEY env var', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;
      delete process.env.KIRO_SESSION_ID;
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';

      const config = await loadConfig();

      expect(config.tool).toBe('claude-code');
    });

    it('should throw error for missing config file', async () => {
      process.env.MCP_CONTEXT_CONFIG = '/nonexistent/path/config.json';

      await expect(loadConfig()).rejects.toThrow('Failed to load config');
    });

    it('should throw error for invalid JSON', async () => {
      const invalidPath = join(tmpDir, 'invalid.json');
      await writeFile(invalidPath, '{ invalid json', 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = invalidPath;

      await expect(loadConfig()).rejects.toThrow('Failed to load config');
    });
  });

  describe('config validation', () => {
    it('should reject config without tool field', async () => {
      const invalidConfig = {
        paths: { sessions_dir: './test' },
        thresholds: { warning: 0.60, critical: 0.80 },
      };

      const configPath = join(tmpDir, 'no-tool.json');
      await writeFile(configPath, JSON.stringify(invalidConfig), 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = configPath;

      await expect(loadConfig()).rejects.toThrow('tool');
    });

    it('should reject config without paths.sessions_dir', async () => {
      const invalidConfig = {
        tool: 'test',
        paths: {},
        thresholds: { warning: 0.60, critical: 0.80 },
      };

      const configPath = join(tmpDir, 'no-sessions-dir.json');
      await writeFile(configPath, JSON.stringify(invalidConfig), 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = configPath;

      await expect(loadConfig()).rejects.toThrow('sessions_dir');
    });

    it('should reject config with invalid threshold values', async () => {
      const invalidConfig = {
        tool: 'test',
        paths: { sessions_dir: './test', session_id_file: null },
        hooks: {
          session_id_capture: { command: null, output_file: null, description: '' },
          context_check: {
            type: 'estimation' as const,
            command: null,
            output_regex: null,
            description: '',
          },
        },
        thresholds: { warning: 1.5, critical: 0.80 },
      };

      const configPath = join(tmpDir, 'invalid-threshold.json');
      await writeFile(configPath, JSON.stringify(invalidConfig), 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = configPath;

      await expect(loadConfig()).rejects.toThrow('between 0 and 1');
    });

    it('should reject config where warning >= critical', async () => {
      const invalidConfig = {
        tool: 'test',
        paths: { sessions_dir: './test', session_id_file: null },
        hooks: {
          session_id_capture: { command: null, output_file: null, description: '' },
          context_check: {
            type: 'estimation' as const,
            command: null,
            output_regex: null,
            description: '',
          },
        },
        thresholds: { warning: 0.80, critical: 0.60 },
      };

      const configPath = join(tmpDir, 'warning-gte-critical.json');
      await writeFile(configPath, JSON.stringify(invalidConfig), 'utf-8');
      process.env.MCP_CONTEXT_CONFIG = configPath;

      await expect(loadConfig()).rejects.toThrow('warning must be less than');
    });
  });

  describe('getConfig', () => {
    it('should return the same config instance on multiple calls', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;

      const config1 = await getConfig();
      const config2 = await getConfig();

      expect(config1).toBe(config2);
    });

    it('should reload config after resetConfig', async () => {
      delete process.env.MCP_CONTEXT_CONFIG;

      const config1 = await getConfig();
      resetConfig();
      const config2 = await getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });
});
