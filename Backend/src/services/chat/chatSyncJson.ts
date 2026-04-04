import type { Prisma } from '@prisma/client';

export function chatSyncJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as Prisma.InputJsonValue;
}
