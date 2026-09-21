#!/usr/bin/env node
// fo — a small command-line client for Family Organizer.
//
// Built for the Claude Code skills in ./skills (and handy by hand). Zero
// dependencies; Node 20+. Talks to the REST API as a dedicated household
// account whose credentials live in ~/.config/family-organizer/cli.env:
//
//   FO_BASE_URL=https://familyorganizer.tail411eff.ts.net
//   FO_USERNAME=claude-bot
//   FO_PASSWORD=…
//
// The session cookie is cached next to it (session.json) so repeated calls
// don't hit the login rate limit (15 per 15 min).
//
// Usage: fo <command> [args] [--json]
//   task add "<title>" [--due today|tomorrow|YYYY-MM-DD] [--priority 0-5] [--assign <username>] [--notes "…"]
//   task list [--status OPEN|IN_PROGRESS|BLOCKED|DONE]
//   grocery add "<items>" [--list "<list name>"]      items: "2 gallons milk, eggs, 3 lb apples"
//   grocery lists
//   inventory add "<name>" [--qty N] [--unit u] [--category c] [--threshold N] [--drinks] [--notes "…"]
//   inventory list [--search x] [--drinks] [--low]
//   display [dashboard|kiosk|guest]                    no arg: show the current command
//   whoami

import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'family-organizer');
const ENV_FILE = process.env.FO_ENV_FILE ?? join(CONFIG_DIR, 'cli.env');
const SESSION_FILE = process.env.FO_ENV_FILE ? process.env.FO_ENV_FILE + '.session.json' : join(CONFIG_DIR, 'session.json');

/* ─── args ─── */

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  } else {
    positional.push(a);
  }
}
const JSON_OUT = flags.json === true;

function out(human, data) {
  if (JSON_OUT) process.stdout.write(JSON.stringify(data ?? { message: human }, null, 2) + '\n');
  else process.stdout.write(human + '\n');
}
function fail(msg, code = 1) {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ error: msg }) + '\n');
  else process.stderr.write(`fo: ${msg}\n`);
  process.exit(code);
}

/* ─── config + session ─── */

function loadEnv() {
  if (!existsSync(ENV_FILE)) fail(`missing ${ENV_FILE} (FO_BASE_URL, FO_USERNAME, FO_PASSWORD)`, 2);
  const env = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  for (const k of ['FO_BASE_URL', 'FO_USERNAME', 'FO_PASSWORD']) if (!env[k]) fail(`${k} missing in ${ENV_FILE}`, 2);
  return { base: env.FO_BASE_URL.replace(/\/$/, '') + '/api/v1', username: env.FO_USERNAME, password: env.FO_PASSWORD };
}

const cfg = loadEnv();
let cookie = '';
try { cookie = JSON.parse(readFileSync(SESSION_FILE, 'utf8')).cookie ?? ''; } catch { /* no session yet */ }

function saveCookie(setCookie) {
  const m = /(connect\.sid|[^=;,\s]+)=([^;]+)/.exec(setCookie ?? '');
  if (!m) return;
  cookie = `${m[1]}=${m[2]}`;
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify({ cookie }));
  try { chmodSync(SESSION_FILE, 0o600); } catch { /* best effort */ }
}

async function raw(method, path, body) {
  const res = await fetch(cfg.base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { res, data };
}

async function login() {
  const { res, data } = await raw('POST', '/auth/login', { username: cfg.username, password: cfg.password });
  if (!res.ok) fail(`login failed as ${cfg.username}: ${data?.error?.message ?? res.status}`, 3);
  saveCookie(res.headers.get('set-cookie'));
  return data;
}

async function api(method, path, body) {
  let { res, data } = await raw(method, path, body);
  if (res.status === 401) {
    await login();
    ({ res, data } = await raw(method, path, body));
  }
  if (!res.ok) fail(`${method} ${path} → ${res.status} ${data?.error?.code ?? ''} ${data?.error?.message ?? ''}`.trim(), 4);
  return data;
}

/* ─── helpers ─── */

function parseDue(v) {
  if (!v) return undefined;
  const d = new Date();
  d.setHours(17, 0, 0, 0); // "due today" means end of the working day, not midnight
  const s = String(v).toLowerCase();
  if (s === 'today') return d.toISOString();
  if (s === 'tomorrow') { d.setDate(d.getDate() + 1); return d.toISOString(); }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 17, 0, 0, 0); return t.toISOString(); }
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) fail(`can't understand due date "${v}" (use today, tomorrow or YYYY-MM-DD)`);
  return t.toISOString();
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ─── commands ─── */

async function taskAdd() {
  const title = positional[2];
  if (!title) fail('usage: fo task add "<title>" [--due …] [--priority N] [--assign user] [--notes …]');
  const payload = { title, priority: flags.priority !== undefined ? Number(flags.priority) : 0 };
  const due = parseDue(flags.due);
  if (due) payload.dueAt = due;
  if (flags.notes) payload.description = String(flags.notes);
  if (flags.assign) {
    let users;
    try {
      users = (await api('GET', '/auth/users')).items;
    } catch {
      fail(`--assign needs the bot account to be an ADMIN (it can't list users). Task not created.`);
    }
    const u = users.find((x) => x.username.toLowerCase() === String(flags.assign).toLowerCase());
    if (!u) fail(`no user named "${flags.assign}" (have: ${users.map((x) => x.username).join(', ')})`);
    payload.assigneeUserIds = [u.id];
  }
  const task = await api('POST', '/tasks', payload);
  out(`Added task #${task.id}: ${task.title}${task.dueAt ? ` (due ${fmtDate(task.dueAt)})` : ''}${flags.assign ? ` → ${flags.assign}` : ''}`, task);
}

async function taskList() {
  const q = flags.status ? `?status=${encodeURIComponent(String(flags.status).toUpperCase())}&limit=50` : '?limit=50';
  const data = await api('GET', `/tasks${q}`);
  const items = data.items ?? [];
  const lines = items.map((t) => {
    const who = (t.assignments ?? []).map((a) => a.user?.username).filter(Boolean).join(', ');
    return `#${t.id} [${t.status}] ${t.title}${t.dueAt ? ` · due ${fmtDate(t.dueAt)}` : ''}${who ? ` · ${who}` : ''}`;
  });
  out(lines.length ? lines.join('\n') : 'No tasks.', data);
}

async function groceryLists() {
  const data = await api('GET', '/grocery/lists?includeItems=true');
  const lists = data.items ?? data;
  out(lists.map((l) => `#${l.id} ${l.name}${l.store ? ` (${l.store})` : ''}${l.isActive ? ' · active' : ''} · ${(l.items ?? []).length} items`).join('\n') || 'No lists.', lists);
}

async function pickList() {
  const data = await api('GET', '/grocery/lists');
  const lists = data.items ?? data;
  if (!lists.length) fail('no grocery lists exist yet — create one in the app first');
  if (flags.list) {
    const l = lists.find((x) => x.name.toLowerCase() === String(flags.list).toLowerCase())
      ?? lists.find((x) => x.name.toLowerCase().includes(String(flags.list).toLowerCase()));
    if (!l) fail(`no grocery list matching "${flags.list}" (have: ${lists.map((x) => x.name).join(', ')})`);
    return l;
  }
  return lists.find((x) => x.isActive) ?? lists[0];
}

async function groceryAdd() {
  const text = positional[2];
  if (!text) fail('usage: fo grocery add "<items, comma or newline separated>" [--list name]');
  const list = await pickList();
  // The API's bulk parser takes one item per line; accept commas too.
  const normalized = text.split(/\n|,|;/).map((s) => s.trim()).filter(Boolean).join('\n');
  const data = await api('POST', `/grocery/lists/${list.id}/items/bulk`, { text: normalized });
  const items = data.items ?? [];
  out(`Added ${items.length} item${items.length === 1 ? '' : 's'} to "${list.name}": ${items.map((i) => `${i.quantity && i.quantity !== 1 ? i.quantity + ' ' : ''}${i.unit ? i.unit + ' ' : ''}${i.name}`).join(', ')}`, { list, items });
}

async function inventoryAdd() {
  const name = positional[2];
  if (!name) fail('usage: fo inventory add "<name>" [--qty N] [--unit u] [--category c] [--threshold N] [--drinks] [--notes …]');
  const payload = { name };
  if (flags.qty !== undefined) payload.quantity = Number(flags.qty);
  if (flags.unit) payload.unit = String(flags.unit);
  if (flags.category) payload.category = String(flags.category);
  if (flags.threshold !== undefined) payload.lowStockThreshold = Number(flags.threshold);
  if (flags.notes) payload.notes = String(flags.notes);
  if (flags.drinks === true) payload.isDrinkFridge = true;
  const item = await api('POST', '/inventory', payload);
  out(`Added to inventory: ${item.quantity}${item.unit ? ' ' + item.unit : ''} ${item.name}${item.category ? ` (${item.category})` : ''}${item.isDrinkFridge ? ' · drink fridge' : ''}`, item);
}

async function inventoryList() {
  const params = new URLSearchParams();
  if (flags.search) params.set('search', String(flags.search));
  if (flags.drinks === true) params.set('drinkFridge', 'true');
  if (flags.low === true) params.set('lowStock', 'true');
  const data = await api('GET', `/inventory${params.toString() ? '?' + params : ''}`);
  const items = data.items ?? [];
  out(items.map((i) => `#${i.id} ${i.quantity}${i.unit ? ' ' + i.unit : ''} ${i.name}${i.category ? ` (${i.category})` : ''}${i.isDrinkFridge ? ' 🥤' : ''}${i.lowStockThreshold != null && i.quantity <= i.lowStockThreshold ? ' · LOW' : ''}`).join('\n') || 'Nothing in inventory.', data);
}

async function display() {
  const mode = positional[1];
  if (!mode) {
    const cur = await api('GET', '/settings/display');
    out(`Wall display is set to: ${cur.mode}${cur.requestedAt ? ` (since ${new Date(cur.requestedAt).toLocaleString()})` : ''}`, cur);
    return;
  }
  const m = { private: 'guest', guest: 'guest', kiosk: 'kiosk', dashboard: 'dashboard', family: 'dashboard', normal: 'dashboard' }[mode.toLowerCase()];
  if (!m) fail('usage: fo display [dashboard|kiosk|guest]   (aliases: private → guest, family → dashboard)');
  const cur = await api('PATCH', '/settings/display', { mode: m });
  out(`Wall display → ${m}. It switches within ~20 seconds.`, cur);
}

async function whoami() {
  const me = await api('GET', '/auth/me');
  out(`${me.username} (${me.role}) at ${cfg.base}`, me);
}

/* ─── dispatch ─── */

const [group, sub] = positional;
const table = {
  'task add': taskAdd, 'task list': taskList,
  'grocery add': groceryAdd, 'grocery lists': groceryLists, 'grocery list': groceryLists,
  'inventory add': inventoryAdd, 'inventory list': inventoryList,
  display, whoami,
};
const handler = table[`${group} ${sub}`] ?? table[group];
if (!handler) {
  process.stderr.write(readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//   ') || l.startsWith('// Usage')).map((l) => l.slice(3)).join('\n') + '\n');
  process.exit(1);
}
await handler();
