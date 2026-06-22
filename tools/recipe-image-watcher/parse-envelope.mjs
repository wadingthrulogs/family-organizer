// Parses the `claude --output-format json` envelope (read from stdin) for one
// image, logs cost/usage, and writes the model's JSON result to $OUT_FILE.
//
// This step never touches authentication or billing — it only parses output.
// If the result isn't valid JSON it's saved alongside as <name>.raw.txt so
// nothing is lost and the run still counts as "processed".
import { writeFileSync, readFileSync } from 'node:fs';

const OUT_FILE = process.env.OUT_FILE;
const BASE = process.env.BASE ?? 'image';

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

if (!OUT_FILE) {
  log('ERROR parse-envelope: OUT_FILE not set');
  process.exit(0);
}

let raw = '';
try {
  raw = readFileSync(0, 'utf8'); // fd 0 = stdin
} catch (e) {
  log(`ERROR parse-envelope: could not read stdin for ${BASE}: ${e.message}`);
  process.exit(0);
}

let env;
try {
  env = JSON.parse(raw);
} catch (e) {
  log(`ERROR parse-envelope: claude envelope not valid JSON for ${BASE}: ${e.message}`);
  process.exit(0);
}

if (env.is_error) {
  log(`ERROR claude reported is_error for ${BASE}: ${String(env.result ?? '').slice(0, 300)}`);
  process.exit(0);
}

// Cost/usage are logged for monitoring. The biller is determined by auth (the
// subscription login), not by this field.
const usage = env.usage ? JSON.stringify(env.usage) : 'n/a';
log(`COST ${BASE}: total_cost_usd=${env.total_cost_usd ?? 'n/a'} usage=${usage}`);

let result = String(env.result ?? '').trim();
// Strip an accidental ```json ... ``` fence if the model added one.
const fence = result.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
if (fence) result = fence[1].trim();

try {
  const parsed = JSON.parse(result);
  writeFileSync(OUT_FILE, JSON.stringify(parsed, null, 2) + '\n');
  log(`WROTE ${OUT_FILE}`);
} catch {
  const rawOut = OUT_FILE.replace(/\.json$/, '.raw.txt');
  writeFileSync(rawOut, result + '\n');
  log(`WARN result for ${BASE} was not valid JSON; saved raw text to ${rawOut}`);
}
