import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { logger } from './logger.js';

let transporter: Transporter | null = null;
let smtpFrom = '';

/**
 * Initialise the SMTP transport. Call once at startup.
 * Returns true if SMTP is ready to send.
 */
export function initMailer(opts: {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  from?: string;
}): boolean {
  if (!opts.host || !opts.user || !opts.pass) {
    logger.warn('SMTP not configured – email notifications disabled');
    return false;
  }

  smtpFrom = opts.from ?? `Family Organizer <${opts.user}>`;

  transporter = nodemailer.createTransport({
    host: opts.host,
    port: opts.port ?? 587,
    secure: (opts.port ?? 587) === 465,
    auth: { user: opts.user, pass: opts.pass },
  });

  logger.info('SMTP transport configured', { host: opts.host, port: opts.port ?? 587 });
  return true;
}

export function isMailerReady(): boolean {
  return transporter !== null;
}

/**
 * Send an email. Throws on failure.
 */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
  if (!transporter) {
    throw new Error('SMTP transport not initialised');
  }

  await transporter.sendMail({
    from: smtpFrom,
    to,
    subject,
    text,
    html: html ?? text,
  });
}
