/**
 * Custom request headers the clients attach (see `Frontend/src/api/axios.ts` and
 * `authRefresh.ts`). Native builds are cross-origin (`https://localhost` →
 * `bandeja.me`), so any header missing from the allow list makes the browser
 * block the request before it is sent — the server never sees it.
 */
export const CLIENT_CUSTOM_REQUEST_HEADERS = [
  'X-Client-Version',
  'X-Client-Platform',
  'X-App-Locale',
  'X-Refresh-Request-Id',
  'X-E2E-Test',
  'X-Klikteren-Cookie',
] as const;

const STANDARD_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'Cache-Control',
  'Pragma',
  'Expires',
  'Accept',
  'If-None-Match',
] as const;

export const CORS_ALLOWED_HEADERS: string[] = [
  ...STANDARD_ALLOWED_HEADERS,
  ...CLIENT_CUSTOM_REQUEST_HEADERS,
];

export const CORS_EXPOSED_HEADERS: string[] = [
  'ETag',
  'X-Response-Size',
  'X-Klikteren-Set-Cookie',
];
