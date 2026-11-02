import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'spike-client', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: ['mcp-hello.mjs'] }));
const tools = await client.listTools();
const res = await client.callTool({ name: 'hello', arguments: { name: 'Thieme' } });
console.log(JSON.stringify({ tools: tools.tools.map((t) => t.name), result: res.content[0].text }));
await client.close();
