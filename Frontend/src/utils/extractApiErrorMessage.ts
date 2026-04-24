import type { TFunction } from 'i18next';

export function extractApiErrorMessage(
  err: unknown,
  t: TFunction,
  fallbackKey: string = 'errors.generic'
): string {
  const e = err as {
    response?: { data?: unknown; status?: number; statusText?: string };
    code?: string;
    message?: string;
  };

  if (e?.response?.data && typeof e.response.data === 'object' && e.response.data !== null) {
    const data = e.response.data as { message?: string; minClientVersion?: unknown };
    if (typeof data.message === 'string' && data.message.length > 0) {
      const key = data.message;
      if (key === 'auth.clientUpgradeRequired') {
        const mv =
          typeof data.minClientVersion === 'string' && data.minClientVersion.length > 0
            ? data.minClientVersion
            : '—';
        const translated = t(key, { minVersion: mv });
        return translated !== key ? translated : key;
      }
      const translated = t(key);
      return translated !== key ? translated : key;
    }
    return JSON.stringify(e.response.data);
  }

  if (e?.response) {
    return `Error ${e.response.status}: ${e.response.statusText}`;
  }

  if (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED') {
    return t('errors.networkError');
  }

  if (e?.message && e.message !== 'Network Error') {
    const m = e.message;
    if (m.startsWith('auth.')) {
      const translated = t(m);
      return translated !== m ? translated : m;
    }
    return m;
  }

  return t(fallbackKey);
}
