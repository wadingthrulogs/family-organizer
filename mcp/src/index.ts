import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadEnv } from './config/env.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const server = buildServer(env);

  if (env.MCP_TRANSPORT === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Keep alive on stdio; exit cleanly when stdin closes.
    process.stdin.on('end', () => process.exit(0));
    return;
  }

  // HTTP/SSE transport (lazy-loaded so the stdio path doesn't pay the express cost).
  const [{ default: express }, { SSEServerTransport }] = await Promise.all([
    import('express'),
    import('@modelcontextprotocol/sdk/server/sse.js'),
  ]);

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  if (env.MCP_HTTP_BEARER) {
    app.use((req, res, next) => {
      const header = req.header('authorization');
      if (header !== `Bearer ${env.MCP_HTTP_BEARER}`) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } });
        return;
      }
      next();
    });
  } else {
    process.stderr.write(
      'family-organizer-mcp: WARNING — running HTTP transport without MCP_HTTP_BEARER. ' +
        'Set MCP_HTTP_BEARER and restart before exposing this server beyond localhost.\n',
    );
  }

  type SSETransport = InstanceType<typeof SSEServerTransport>;
  const transports = new Map<string, SSETransport>();

  app.get('/sse', async (_req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);
    res.on('close', () => transports.delete(transport.sessionId));
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId;
    if (typeof sessionId !== 'string') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing sessionId' } });
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown sessionId' } });
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.listen(env.MCP_HTTP_PORT, env.MCP_HTTP_HOST, () => {
    process.stderr.write(
      `family-organizer-mcp: HTTP transport listening on ${env.MCP_HTTP_HOST}:${env.MCP_HTTP_PORT}\n`,
    );
  });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  process.stderr.write(`family-organizer-mcp: fatal\n${message}\n`);
  process.exit(1);
});
