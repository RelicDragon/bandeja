export function getResponseBodySize(body: unknown): number {
  if (body === undefined) return 0;

  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf8');
  }

  if (Buffer.isBuffer(body)) {
    return body.byteLength;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (ArrayBuffer.isView(body)) {
    return body.byteLength;
  }

  if (typeof body === 'number' || typeof body === 'boolean' || typeof body === 'bigint') {
    return Buffer.byteLength(String(body), 'utf8');
  }

  try {
    return Buffer.byteLength(JSON.stringify(body), 'utf8');
  } catch {
    return 0;
  }
}
