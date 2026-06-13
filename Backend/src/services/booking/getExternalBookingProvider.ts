import { ClubIntegrationType } from '@prisma/client';
import type { ExternalBookingProvider } from './ExternalBookingProvider';
import { booktimeExternalBookingProvider } from './providers/BooktimeExternalBookingProvider';

const providers: Partial<Record<ClubIntegrationType, ExternalBookingProvider>> = {
  [ClubIntegrationType.BOOKTIME]: booktimeExternalBookingProvider,
};

let testOverride: ExternalBookingProvider | null = null;

export function setExternalBookingProviderForTests(provider: ExternalBookingProvider | null): void {
  testOverride = provider;
}

export function getExternalBookingProvider(
  integrationType: ClubIntegrationType,
): ExternalBookingProvider | null {
  if (testOverride) return testOverride;
  return providers[integrationType] ?? null;
}
