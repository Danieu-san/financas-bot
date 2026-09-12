import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import { buildWidgetHtml } from './widget.mjs';

const PORT = Number.parseInt(process.env.PORT || '3210', 10);
const WATCH_TEMPLATE_URI = 'ui://financasbot/chat-wake-definitive-v1.html';
const RAW_STATE_URL = process.env.CHAT_WAKE_STATE_URL || null;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_SDK_PATH = path.join(
  HERE,
  'node_modules',
  '@modelcontextprotocol',
  'ext-apps',
  'dist',
  'src',
  'app-with-deps.js',
);
const APP_SDK_SOURCE = fs.readFileSync(APP_SDK_PATH, 'utf8');

function widgetResource(uri, html) {
  return {
    contents: [
      {
        uri,
        mimeType: 'text/html;profile=mcp-app',
        text: html,
        _meta: {
          ui: {
            prefersBorder: true,
            csp: {
              connectDomains: ['https://raw.githubusercontent.com'],
              resourceDomains: [],
            },
          },
        },
      },
    ],
  };
}

function createMcpServer() {
  const server = new McpServer(
    { name: 'financasbot-chat-wake', version: '0.1.1' },
    {
      instructions:
        'Abra a ponte somente quando o usuário pedir para armar o retorno Chat-Codex. O componente apenas observa o estado público versionado e publica uma campainha ORCH_WAKE.',
    },
  );

  server.registerResource('chat-wake-widget', WATCH_TEMPLATE_URI, {}, async () =>
    widgetResource(
      WATCH_TEMPLATE_URI,
      buildWidgetHtml({ appSdkSource: APP_SDK_SOURCE, stateUrl: RAW_STATE_URL }),
    ),
  );

  server.registerTool(
    'open_financasbot_chat_wake',
    {
      title: 'Open Chat-Codex wake bridge',
      description:
        'Open the persistent Chat-Codex wake component that observes the versioned public state.',
      inputSchema: {},
      outputSchema: {
        armed: z.boolean(),
        mode: z.literal('watch'),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
      _meta: {
        ui: { resourceUri: WATCH_TEMPLATE_URI },
        'openai/outputTemplate': WATCH_TEMPLATE_URI,
        'openai/toolInvocation/invoking': 'Armando ponte…',
        'openai/toolInvocation/invoked': 'Ponte armada.',
      },
    },
    async () => ({
      structuredContent: { armed: true, mode: 'watch' },
      content: [
        {
          type: 'text',
          text: 'Ponte armada para observar CHAT_READY sem iniciar modelo durante espera.',
        },
      ],
    }),
  );

  return server;
}

const app = express();
app.use(express.json({ limit: '256kb' }));
app.get('/healthz', (_request, response) => response.json({ ok: true }));
app.all('/mcp', async (request, response) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  response.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) {
      response.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal MCP error' },
        id: null,
      });
    }
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`financasbot-chat-wake listening at http://127.0.0.1:${PORT}/mcp`);
});

export { createMcpServer };
