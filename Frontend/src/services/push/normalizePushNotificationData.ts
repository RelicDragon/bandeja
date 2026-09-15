export type NormalizedPushNotificationData = {
  type: string;
  data: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readType(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function parseNestedData(value: unknown): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) {
    return direct;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  if (!text.startsWith('{')) {
    return null;
  }
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return null;
  }
}

export function normalizePushNotificationData(
  rawData: unknown
): NormalizedPushNotificationData | null {
  const raw = asRecord(rawData);
  if (!raw) {
    return null;
  }

  const nested = parseNestedData(raw.data);
  const type = readType(raw.type) ?? (nested ? readType(nested.type) : null);
  if (!type) {
    return null;
  }

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'type' || key === 'data') continue;
    rest[key] = value;
  }
  const data: Record<string, unknown> = {
    ...(nested ?? {}),
    ...rest,
  };
  delete data.type;
  if (typeof data.gameId !== 'string') {
    const inner = parseNestedData(data.data);
    if (inner) {
      const merged: Record<string, unknown> = { ...inner, ...data };
      delete merged.data;
      delete merged.type;
      return { type, data: merged };
    }
  }
  return { type, data };
}
