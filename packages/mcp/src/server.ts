#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {
  analyzeFileForMcp,
  analyzeSinceForMcp,
  analyzeWorkingTreeForMcp,
  createContextBundleForMcp,
  scanRepositoryForMcp,
} from './service.js';

export function createCodeCausalityServer(): McpServer {
  const server = new McpServer({
    name: 'codecausality',
    version: '0.1.0',
  });

  server.registerTool(
    'codecausality_scan_repository',
    {
      description:
        'Summarize repository structure, cycles, hotspots, and source relationship metrics without using an LLM.',
      inputSchema: z.object({
        rootDir: z.string().optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ rootDir, maxItems }) =>
      toolResult(await scanRepositoryForMcp({ rootDir, maxItems })),
  );

  server.registerTool(
    'codecausality_impact_file',
    {
      description:
        'Analyze the deterministic blast radius of one source file, including affected tests, modules, and architecture violations.',
      inputSchema: z.object({
        file: z.string().min(1),
        rootDir: z.string().optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ file, rootDir, maxItems }) =>
      toolResult(await analyzeFileForMcp(file, { rootDir, maxItems })),
  );

  server.registerTool(
    'codecausality_impact_working_tree',
    {
      description:
        'Analyze changed source files in the current Git working tree and return compact change-impact evidence.',
      inputSchema: z.object({
        rootDir: z.string().optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ rootDir, maxItems }) =>
      toolResult(await analyzeWorkingTreeForMcp({ rootDir, maxItems })),
  );

  server.registerTool(
    'codecausality_impact_since',
    {
      description:
        'Analyze source changes between a Git base ref and HEAD and return compact change-impact evidence.',
      inputSchema: z.object({
        baseRef: z.string().min(1),
        rootDir: z.string().optional(),
        maxItems: z.number().int().min(1).max(200).optional(),
      }),
    },
    async ({ baseRef, rootDir, maxItems }) =>
      toolResult(await analyzeSinceForMcp(baseRef, { rootDir, maxItems })),
  );

  server.registerTool(
    'codecausality_context_bundle',
    {
      description:
        'Build a versioned, size-bounded AI context bundle from CodeCausality change evidence. Omit baseRef to analyze the working tree.',
      inputSchema: z.object({
        baseRef: z.string().min(1).optional(),
        rootDir: z.string().optional(),
        maxChars: z.number().int().min(1500).max(100000).optional(),
      }),
    },
    async ({ baseRef, rootDir, maxChars }) =>
      toolResult(await createContextBundleForMcp(baseRef, { rootDir, maxChars })),
  );

  return server;
}

function toolResult(value: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function main(): Promise<void> {
  await serveStdio(createCodeCausalityServer);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`CodeCausality MCP failed: ${message}`);
  process.exitCode = 1;
});
