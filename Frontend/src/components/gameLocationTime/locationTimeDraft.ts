import type { BooktimeBookingRecord } from '@/integrations/booktime/client';
import type { LocationTimeMode } from './LocationTimeMode';

export type EditLocationTimeDraft = {
  locationTimeMode: LocationTimeMode;
  selectedBookingIds: string[];
  selectedBookingRecords: BooktimeBookingRecord[];
  timeOverride: boolean;
  overrideStartTime?: string;
  overrideEndTime?: string;
  willBookOnCreate: boolean;
  integratedCourtIds: string[];
};
