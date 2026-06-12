export type BooktimeRollbackResult = {
  attempted: boolean;
  cancelled: boolean;
  error?: string;
};

export function readBooktimeRollbackFromError(err: unknown): BooktimeRollbackResult | undefined {
  if (!err || typeof err !== 'object' || !('response' in err)) return undefined;
  const payload = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
  const rollback = payload?.booktimeRollback;
  if (!rollback || typeof rollback !== 'object') return undefined;
  const row = rollback as Record<string, unknown>;
  if (typeof row.attempted !== 'boolean' || typeof row.cancelled !== 'boolean') return undefined;
  return {
    attempted: row.attempted,
    cancelled: row.cancelled,
    error: typeof row.error === 'string' ? row.error : undefined,
  };
}
