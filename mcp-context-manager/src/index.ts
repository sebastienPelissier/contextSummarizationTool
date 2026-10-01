/**
 * mcp-context-manager — entry point.
 *
 * Local MCP server (stdio) for AI session context management.
 * Exposes 4 tools: summarize_context, suggest_cleanup, export_summary, load_session.
 *
 * stdout = MCP protocol channel — never use console.log().
 * Use console.error() for all diagnostic output.
 */

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import { validateSummary } from './tools/summarize.js';
import { analyzeCleanup } from './tools/cleanup.js';
import { exportSummary } from './tools/export.js';
import { listSessions, loadSession } from './tools/load.js';

/**
 * Creates and configures the MCP server with all 4 tools registered.
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: 'mcp-context-manager',
    version: '1.0.0',
  });

  server.registerTool(
    'summarize_context',
    {
      description:
        'Validates and structures a session summary written by the agent. ' +
        'Checks for 6 mandatory sections (## Main Objective, ## Decisions Made, ' +
        '## Modified Files, ## Next Steps, ## Warnings, ## Resume Here), ' +
        'flags hollow phrases (n/a, tbd, todo...), and validates the summary ' +
        'fits within 500 tokens. Does NOT generate content from raw session text.',
      inputSchema: {
        draft_summary: z.string().min(1).describe(
          'Agent-written session summary draft to validate and structure',
        ),
      },
    },
    async ({ draft_summary }) => {
      try {
        const result = validateSummary(draft_summary);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error('[summarize_context]', error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'suggest_cleanup',
    {
      description:
        'Analyzes session text and identifies verbose or redundant content to remove. ' +
        'Detects: code blocks > 50 lines, repeated paragraphs, resolved error logs, ' +
        'verbose command outputs. Returns suggestions with estimated token savings.',
      inputSchema: {
        session_text: z.string().min(1).describe(
          'Session text to analyze for cleanup opportunities',
        ),
      },
    },
    async ({ session_text }) => {
      try {
        const result = analyzeCleanup(session_text);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error('[suggest_cleanup]', error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'export_summary',
    {
      description:
        'Saves a session summary to a timestamped Markdown file in ./context-summaries/. ' +
        'Naming: session-YYYY-MM-DD-<subject>.md. ' +
        'Anti-overwrite: suffixes -2, -3, etc. if file already exists. ' +
        'Creates directory automatically if absent.',
      inputSchema: {
        summary: z.string().min(1).describe('Session summary content to export'),
        subject: z.string().optional().describe(
          'Subject for the filename in kebab-case (5 words max)',
        ),
        output_dir: z.string().optional().describe(
          'Output directory path (default: ./context-summaries)',
        ),
      },
    },
    async ({ summary, subject, output_dir }) => {
      try {
        const result = await exportSummary(summary, subject, output_dir);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error('[export_summary]', error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'load_session',
    {
      description:
        'Lists or loads previous session summary files from ./context-summaries/. ' +
        'Without file_name: lists available sessions with date, subject, and objective. ' +
        'With file_name: returns file content ready to inject as context. ' +
        'Never silently loads the most recent — always lists and lets the user confirm.',
      inputSchema: {
        file_name: z.string().optional().describe(
          'Session file name to load. Omit to list all available sessions.',
        ),
        sessions_dir: z.string().optional().describe(
          'Sessions directory path (default: ./context-summaries)',
        ),
      },
    },
    async ({ file_name, sessions_dir }) => {
      try {
        if (file_name) {
          const result = await loadSession(file_name, sessions_dir);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        }
        const result = await listSessions(sessions_dir);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        console.error('[load_session]', error);
        return {
          content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

void serveStdio(createServer);
