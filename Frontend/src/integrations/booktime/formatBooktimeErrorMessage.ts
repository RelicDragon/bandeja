type BooktimeErrorBody = {
  message?: string;
  error?: string;
  errorCode?: string;
  errors?: unknown;
};

function pushUnique(parts: string[], value: string | undefined | null): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  if (!parts.some((part) => part === trimmed || part.includes(trimmed))) {
    parts.push(trimmed);
  }
}

function readBooktimeErrorBody(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const body = data as BooktimeErrorBody;
  const parts: string[] = [];
  pushUnique(parts, body.message);
  pushUnique(parts, body.error);
  pushUnique(parts, body.errorCode);
  if (Array.isArray(body.errors)) {
    for (const item of body.errors) {
      if (typeof item === 'string') {
        pushUnique(parts, item);
        continue;
      }
      if (item && typeof item === 'object' && 'message' in item) {
        const message = (item as { message: unknown }).message;
        if (typeof message === 'string') pushUnique(parts, message);
      }
    }
  }
  return parts;
}

function readAxiosResponseMessage(err: unknown): string[] {
  if (!err || typeof err !== 'object' || !('response' in err)) return [];
  const response = (err as { response?: { data?: unknown; status?: number } }).response;
  const parts = readBooktimeErrorBody(response?.data);
  if (response?.data && typeof response.data === 'object' && 'message' in response.data) {
    pushUnique(parts, String((response.data as { message: unknown }).message));
  }
  if (parts.length === 0 && typeof response?.status === 'number') {
    parts.push(`HTTP ${response.status}`);
  }
  return parts;
}

function readClientError(err: unknown): string[] {
  if (!err || typeof err !== 'object') return [];
  const parts: string[] = [];
  if ('data' in err) {
    parts.push(...readBooktimeErrorBody((err as { data: unknown }).data));
  }
  if (err instanceof Error) {
    pushUnique(parts, err.message);
  }
  if ('status' in err && typeof (err as { status: unknown }).status === 'number') {
    const status = (err as { status: number }).status;
    if (parts.length === 0) parts.push(`HTTP ${status}`);
  }
  return parts;
}

export function formatBooktimeErrorMessage(err: unknown, fallback = ''): string {
  const parts: string[] = [];
  parts.push(...readAxiosResponseMessage(err));
  parts.push(...readClientError(err));

  if (
    parts.length === 0 &&
    err instanceof Error &&
    err.name === 'BooktimeSlotTakenError' &&
    err.message.trim()
  ) {
    return err.message.trim();
  }
  if (parts.length === 0 && err instanceof Error && err.message.trim()) {
    return err.message.trim();
  }
  if (parts.length === 0 && typeof err === 'string' && err.trim()) {
    return err.trim();
  }
  if (parts.length === 0) {
    return fallback.trim();
  }
  return parts.join(' — ');
}
