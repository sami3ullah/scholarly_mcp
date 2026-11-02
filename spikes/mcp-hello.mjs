// Phase 0 spike: minimal MCP server over stdio with one tool.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'scholarly-mcp-spike', version: '0.0.0' });
server.registerTool('hello', { description: 'Say hello', inputSchema: { name: z.string() }, annotations: { readOnlyHint: true } },
  async ({ name }) => ({ content: [{ type: 'text', text: `Hello, ${name}` }] }));
await server.connect(new StdioServerTransport());
