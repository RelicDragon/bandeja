import { Prisma } from '@prisma/client';

export function isPrismaDeadlockError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
    return true;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes('deadlock detected') || msg.includes('40P01');
}

export function deadlockRetryDelayMs(attempt: number): number {
  const base = 25 * (attempt + 1);
  return base + Math.floor(Math.random() * 40);
}
