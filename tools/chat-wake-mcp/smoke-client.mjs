import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'chat-wake-smoke', version: '0.1.0' });
const transport = new StreamableHTTPClientTransport(
  new URL(process.argv[2] || process.env.MCP_URL || 'http://127.0.0.1:3210/mcp'),
);

try {
  await client.connect(transport);
  const tools = await client.listTools();
  for (const expectedTool of ['open_financasbot_chat_wake']) {
    if (!tools.tools.some(tool => tool.name === expectedTool)) {
      throw new Error(`${expectedTool} não foi anunciado`);
    }
  }
  const result = await client.callTool({
    name: 'open_financasbot_chat_wake',
    arguments: {},
  });
  if (result.structuredContent?.mode !== 'watch') {
    throw new Error('tool não retornou modo watch');
  }
  const pocResourceUri = tools.tools.find(tool => tool.name === 'open_financasbot_chat_wake')
    ?._meta?.ui?.resourceUri;
  const resource = await client.readResource({ uri: pocResourceUri });
  const html = resource.contents?.[0]?.text || '';
  if (!html.includes('hasEmbeddedAppSdk')) {
    throw new Error('widget não contém o SDK embutido');
  }
  process.stdout.write(JSON.stringify({
    ok: true,
    embeddedAppSdk: true,
    tools: tools.tools.map(tool => ({
      name: tool.name,
      resourceUri: tool._meta?.ui?.resourceUri || tool._meta?.['openai/outputTemplate'] || null,
    })),
  }) + '\n');
} finally {
  await client.close();
}
