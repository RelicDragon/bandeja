import type { Club, Court } from '@/types';

export function courtHasActiveBookingIntegration(
  club: Club | undefined,
  court: Court | undefined,
): boolean {
  if (!club || club.integrationType !== 'BOOKTIME') return false;
  if (!club.integrationConfig?.companyId?.trim()) return false;
  if (!court) return false;
  return Boolean(court.externalCourtId?.trim());
}
