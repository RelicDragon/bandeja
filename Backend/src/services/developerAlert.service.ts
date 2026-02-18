import prisma from '../config/database';
import { config } from '../config/env';
import telegramBotService from './telegram/bot.service';
import { escapeMarkdown } from './telegram/utils';

const MAX_BODY_LENGTH = 3900;
const REPORT_TIMEOUT_MS = 8000;
const GLOBAL_THROTTLE_MS = 60000;

const SECRET_PATTERNS = [
  /password[=:]\s*\S+/gi,
  /token[=:]\s*\S+/gi,
  /secret[=:]\s*\S+/gi,
  /Authorization:\s*Bearer\s+\S+/gi,
  /api[_-]?key[=:]\s*\S+/gi,
];

function redactSecrets(s: string): string {
  let out = s;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const stack = err.stack ?? err.message;
    return `${err.message}\n\n\`\`\`\n${stack}\n\`\`\``;
  }
  return String(err);
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + '...';
}

let reporting = false;
let lastReportAt = 0;

function runReport(err: unknown, context?: string): Promise<void> {
  const bodyRaw = redactSecrets(`${formatError(err)}${context ? `\n\nContext: ${context}` : ''}`);
  const body = escapeMarkdown(truncate(bodyRaw, MAX_BODY_LENGTH));
  const text = `🚨 *PadelPulse*\n\n${body}`;

  return (async () => {
    const users = await prisma.user.findMany({
      where: { isDeveloper: true, telegramId: { not: null } },
      select: { telegramId: true },
    });
    const bot = telegramBotService.getBot();
    if (!bot || users.length === 0) return;

    const results = await Promise.allSettled(
      users.map((u) => (u.telegramId ? bot.api.sendMessage(u.telegramId, text, { parse_mode: 'Markdown' }) : Promise.resolve()))
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      process.stderr.write(`[developerAlert] ${failed}/${users.length} Telegram sends failed\n`);
    }
  })();
}

export async function reportCriticalError(err: unknown, context?: string): Promise<void> {
  if (config.nodeEnv !== 'production') return;
  if (reporting) return;
  const now = Date.now();
  if (now - lastReportAt < GLOBAL_THROTTLE_MS) return;

  reporting = true;
  lastReportAt = now;
  try {
    await Promise.race([
      runReport(err, context),
      new Promise<void>((resolve) => setTimeout(resolve, REPORT_TIMEOUT_MS)),
    ]);
  } catch (e) {
    process.stderr.write(`[developerAlert] Failed to report error: ${e}\n`);
  } finally {
    reporting = false;
  }
}

let lastConsoleReport = 0;
const CONSOLE_REPORT_THROTTLE_MS = 10000;

export function maybeReportFromConsole(firstArg: unknown): void {
  if (config.nodeEnv !== 'production') return;
  if (!(firstArg instanceof Error)) return;
  const now = Date.now();
  if (now - lastConsoleReport < CONSOLE_REPORT_THROTTLE_MS) return;
  lastConsoleReport = now;
  reportCriticalError(firstArg, 'console.error').catch(() => {});
}
