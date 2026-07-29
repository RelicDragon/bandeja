import { createHash } from 'node:crypto';

export function deliveryCollapseKey(deliveryKey: string | undefined): string | undefined {
  if (!deliveryKey) return undefined;
  return createHash('sha256').update(deliveryKey).digest('hex');
}
