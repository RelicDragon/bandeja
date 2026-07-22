const KLIKTEREN_UPSTREAM_BASE = 'https://api.klikteren.com';

const ALLOWED_PATH =
  /^\/api\/(?:venues(?:\/[A-Za-z0-9_-]+(?:\/availability)?)?|courts(?:\/[A-Za-z0-9_-]+)?|cities|auth\/(?:login|session|me|signOut)|bookings(?:\/(?:create|cancel))?)(?:\?.*)?$/;

export type KlikterenUpstreamRequest = {
  method: string;
  pathWithQuery: string;
  body?: unknown;
  accessToken?: string | null;
  cookie?: string | null;
};

export type KlikterenUpstreamResponse = {
  status: number;
  body: unknown;
  setCookie: string[];
};

export function isAllowedKlikterenUpstreamPath(pathWithQuery: string): boolean {
  const pathOnly = pathWithQuery.split('?')[0] ?? '';
  return ALLOWED_PATH.test(pathOnly);
}

export async function forwardKlikterenUpstream(
  req: KlikterenUpstreamRequest,
): Promise<KlikterenUpstreamResponse> {
  if (!isAllowedKlikterenUpstreamPath(req.pathWithQuery)) {
    return { status: 404, body: { error: 'Not found' }, setCookie: [] };
  }

  const method = req.method.toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'BandejaKlikterenProxy/1.0',
  };
  if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (req.accessToken) {
    headers.Authorization = `Bearer ${req.accessToken}`;
  }
  if (req.cookie) {
    headers.Cookie = req.cookie;
  }

  const res = await fetch(`${KLIKTEREN_UPSTREAM_BASE}${req.pathWithQuery}`, {
    method,
    headers,
    body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
  });

  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (() => {
          const single = res.headers.get('set-cookie');
          return single ? [single] : [];
        })();

  return { status: res.status, body, setCookie };
}
