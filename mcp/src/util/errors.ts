import { AxiosError, isAxiosError } from 'axios';

/**
 * Convert any thrown value into a single human-readable string suitable for
 * an MCP tool's text-content response. Surfaces the Family Organizer error
 * envelope `{ error: { code, message } }` when present.
 */
export function describeError(err: unknown): string {
  if (isAxiosError(err)) return describeAxiosError(err);
  if (err instanceof Error) return err.message;
  return String(err);
}

function describeAxiosError(err: AxiosError): string {
  const status = err.response?.status;
  const data = err.response?.data as
    | { error?: { code?: string; message?: string; details?: unknown } }
    | undefined;
  const envelope = data?.error;

  if (envelope?.message || envelope?.code) {
    const code = envelope.code ?? 'ERROR';
    const msg = envelope.message ?? '(no message)';
    return status ? `${status} ${code}: ${msg}` : `${code}: ${msg}`;
  }

  if (status) return `${status} ${err.response?.statusText ?? 'HTTP error'}: ${err.message}`;
  return err.message;
}
