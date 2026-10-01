import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Configuration structure for MCP Context Manager.
 * Defines tool-specific paths, hooks, and thresholds.
 */
export interface McpConfig {
  tool: string;
  paths: {
    sessions_dir: string;
    session_id_file: string | null;
  };
  hooks: {
    session_id_capture: {
      command: string | null;
      output_file: string | null;
      description: string;
    };
    context_check: {
      type: 'cli' | 'estimation';
      command: string | null;
      output_regex: string | null;
      description: string;
    };
  };
  thresholds: {
    warning: number;
    critical: number;
  };
}

/**
 * Loads the configuration based on environment variable or auto-detection.
 * Priority:
 * 1. MCP_CONTEXT_CONFIG env var (tool name or custom path)
 * 2. Auto-detection based on environment markers
 * 3. Fallback to default.json
 */
export async function loadConfig(): Promise<McpConfig> {
  const configName = process.env.MCP_CONTEXT_CONFIG;

  if (configName) {
    // Check if it's a custom path (contains / or \)
    if (configName.includes('/') || configName.includes('\\')) {
      return await loadConfigFromPath(configName);
    }
    // Otherwise, treat as tool name (kiro, claude-code, etc.)
    return await loadConfigFromTool(configName);
  }

  // Auto-detection based on environment markers
  const detectedTool = detectTool();
  if (detectedTool) {
    return await loadConfigFromTool(detectedTool);
  }

  // Fallback to default
  return await loadConfigFromTool('default');
}

/**
 * Auto-detects the tool based on environment markers.
 */
function detectTool(): string | null {
  // Check for Kiro-specific environment markers
  if (process.env.KIRO_SESSION_ID || process.env.KIRO_AGENT) {
    return 'kiro';
  }

  // Check for Claude Code-specific environment markers
  if (process.env.CLAUDE_SESSION_ID || process.env.ANTHROPIC_API_KEY) {
    return 'claude-code';
  }

  return null;
}

/**
 * Loads config from a tool name (kiro, claude-code, default).
 */
async function loadConfigFromTool(toolName: string): Promise<McpConfig> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const configPath = resolve(__dirname, '../../config', `${toolName}.json`);
  return await loadConfigFromPath(configPath);
}

/**
 * Loads config from an absolute or relative path.
 */
async function loadConfigFromPath(configPath: string): Promise<McpConfig> {
  try {
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as McpConfig;
    validateConfig(config);
    return config;
  } catch (error) {
    throw new Error(
      `Failed to load config from ${configPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Validates that the config has all required fields.
 */
function validateConfig(config: unknown): asserts config is McpConfig {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Config must be an object');
  }

  const c = config as Record<string, unknown>;

  if (typeof c.tool !== 'string') {
    throw new Error('Config must have a "tool" string field');
  }

  if (typeof c.paths !== 'object' || c.paths === null) {
    throw new Error('Config must have a "paths" object');
  }

  const paths = c.paths as Record<string, unknown>;
  if (typeof paths.sessions_dir !== 'string') {
    throw new Error('Config paths.sessions_dir must be a string');
  }

  if (typeof c.thresholds !== 'object' || c.thresholds === null) {
    throw new Error('Config must have a "thresholds" object');
  }

  const thresholds = c.thresholds as Record<string, unknown>;
  if (typeof thresholds.warning !== 'number' || typeof thresholds.critical !== 'number') {
    throw new Error('Config thresholds.warning and thresholds.critical must be numbers');
  }

  if (thresholds.warning <= 0 || thresholds.warning > 1) {
    throw new Error('Config thresholds.warning must be between 0 and 1');
  }

  if (thresholds.critical <= 0 || thresholds.critical > 1) {
    throw new Error('Config thresholds.critical must be between 0 and 1');
  }

  if (thresholds.warning >= thresholds.critical) {
    throw new Error('Config thresholds.warning must be less than thresholds.critical');
  }
}

/**
 * Global config instance, loaded once on server startup.
 */
let globalConfig: McpConfig | null = null;

/**
 * Gets the current config. Loads it if not already loaded.
 */
export async function getConfig(): Promise<McpConfig> {
  if (!globalConfig) {
    globalConfig = await loadConfig();
  }
  return globalConfig;
}

/**
 * Resets the global config (useful for testing).
 */
export function resetConfig(): void {
  globalConfig = null;
}
