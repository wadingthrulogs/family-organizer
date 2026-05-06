// Smoke-test the MCP server over stdio without needing a running backend.
// Sends an initialize request + tools/list and expects 14 tools.
//
// Run from repo root:
//   $env:ORGANIZER_USERNAME='claude-bot'
//   $env:ORGANIZER_PASSWORD='dummy'
//   node mcp/smoke-test.mjs
import { spawn } from 'node:child_process';

const child = spawn(
  process.execPath,
  ['dist/index.js'],
  {
    cwd: new URL('.', import.meta.url),
    stdio: ['pipe', 'pipe', 'inherit'],
    env: {
      ...process.env,
      ORGANIZER_BASE_URL: process.env.ORGANIZER_BASE_URL ?? 'http://localhost:3000',
      ORGANIZER_USERNAME: process.env.ORGANIZER_USERNAME ?? 'smoke-test',
      ORGANIZER_PASSWORD: process.env.ORGANIZER_PASSWORD ?? 'smoke-test',
      MCP_TRANSPORT: 'stdio',
    },
  },
);

const timer = setTimeout(() => {
  console.error('TIMEOUT: server did not respond within 5s');
  child.kill();
  process.exit(2);
}, 5000);

let buf = '';
const responses = [];
child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      responses.push(msg);
      handle(msg);
    } catch (err) {
      console.error('non-JSON line from server:', line);
    }
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

function handle(msg) {
  if (msg.id === 1) {
    // initialize → send initialized notification + tools/list
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  } else if (msg.id === 2) {
    const tools = msg.result?.tools ?? [];
    console.log(`tools/list returned ${tools.length} tool(s):`);
    for (const t of tools) console.log(`  - ${t.name}`);
    clearTimeout(timer);
    child.kill();
    if (tools.length !== 15) {
      console.error(`FAIL: expected 15 tools, got ${tools.length}`);
      process.exit(3);
    }
    console.log('SMOKE TEST PASSED');
    process.exit(0);
  }
}

child.on('exit', (code, signal) => {
  if (responses.length === 0) {
    console.error(`server exited (code=${code} signal=${signal}) before responding.`);
    process.exit(4);
  }
});

// Kick off the handshake
send({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0.0.0' },
  },
});
