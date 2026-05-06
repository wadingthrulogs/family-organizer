import { z } from 'zod';

const schema = z.object({
  ORGANIZER_BASE_URL: z.string().url().default('http://localhost:3000'),
  ORGANIZER_USERNAME: z.string().min(1),
  ORGANIZER_PASSWORD: z.string().min(1),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  MCP_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(3100),
  MCP_HTTP_HOST: z.string().default('127.0.0.1'),
  MCP_HTTP_BEARER: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    process.stderr.write(
      `family-organizer-mcp: invalid environment\n${issues}\n` +
        `See mcp/.env.example for the required variables.\n`,
    );
    process.exit(1);
  }
  return parsed.data;
}
