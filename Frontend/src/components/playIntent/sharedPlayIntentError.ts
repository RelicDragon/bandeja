function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function sharedPlayIntentErrorTranslationKey(
  error: unknown,
): string | undefined {
  if (!isRecord(error) || !isRecord(error.response)) return undefined;
  const data = error.response.data;
  if (!isRecord(data)) return undefined;
  for (const candidate of [data.code, data.message]) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}
