import { describe, expect, it } from 'vitest';
import { deriveLocationTimeMode } from './LocationTimeMode';

describe('deriveLocationTimeMode', () => {
  it('returns timeSlots when no bookings are selected', () => {
    expect(deriveLocationTimeMode([])).toBe('timeSlots');
  });

  it('returns bookings when at least one booking is selected', () => {
    expect(deriveLocationTimeMode(['booking-1'])).toBe('bookings');
    expect(deriveLocationTimeMode(['booking-1', 'booking-2'])).toBe('bookings');
  });
});
