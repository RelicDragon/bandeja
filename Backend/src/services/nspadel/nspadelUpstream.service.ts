/**
 * Server-side proxy to an NS Padel club's Supabase project.
 *
 * The club's Supabase project URL is NOT hardcoded: it is resolved per club
 * from `Club.integrationConfig.supabaseUrl` (see `parseNspadelIntegrationConfig`).
 * Only PostgREST read paths are forwarded; auth/admin/storage endpoints are rejected.
 */

const ALLOWED_PATH =
  /^\/rest\/v1\/(?:rpc\/)?[A-Za-z0-9_]+(?:\?.*)?$/;

const ALLOWED_METHODS = new Set(['GET', 'POST']);

export type NspadelUpstreamRequest = {
  supabaseUrl: string;
  method: string;
  pathWithQuery: string;
  body?: unknown;
  apikey?: string | null;
  accessToken?: string | null;
};

export type NspadelUpstreamResponse = {
  status: number;
  body: unknown;
};

export function isAllowedNspadelUpstreamPath(pathWithQuery: string): boolean {
  const pathOnly = pathWithQuery.split('?')[0] ?? '';
  if (pathOnly.includes('..')) return false;
  return ALLOWED_PATH.test(pathOnly);
}

export async function forwardNspadelUpstream(
  req: NspadelUpstreamRequest,
): Promise<NspadelUpstreamResponse> {
  if (!isAllowedNspadelUpstreamPath(req.pathWithQuery)) {
    return { status: 404, body: { error: 'Not found' } };
  }
  const method = req.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { status: 405, body: { error: 'Method not allowed' } };
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'BandejaNspadelProxy/1.0',
  };
  if (req.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (req.apikey) {
    headers.apikey = req.apikey;
  }
  if (req.accessToken) {
    headers.Authorization = `Bearer ${req.accessToken}`;
  }

  const res = await fetch(`${req.supabaseUrl}${req.pathWithQuery}`, {
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

  return { status: res.status, body };
}
