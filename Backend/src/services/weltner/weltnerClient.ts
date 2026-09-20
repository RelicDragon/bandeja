import { ApiError } from '../../utils/ApiError';
import { parseWeltnerAvailability, WELTNER_ORIGIN } from './weltnerContract';

export class WeltnerRejectedError extends Error {}

export async function fetchWeltnerAvailability(court: string, date: string) {
  const response = await fetch(
    `${WELTNER_ORIGIN}/api/availability/${encodeURIComponent(court)}?date=${encodeURIComponent(date)}`,
    {
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    },
  );
  if (!response.ok) throw new ApiError(502, 'weltner.availabilityFailed');
  return parseWeltnerAvailability(await response.json(), court, date);
}

/** No retry: a lost response can follow a successful calendar write. */
export async function postWeltnerBooking(body: {
  court: string;
  date: string;
  start: string;
  duration: string;
  name: string;
  phone: string;
}): Promise<string | null> {
  const response = await fetch(`${WELTNER_ORIGIN}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
    redirect: 'error',
  });
  if ([400, 401, 403, 404, 409, 422, 429].includes(response.status))
    throw new WeltnerRejectedError('weltner.bookingRejected');
  if (!response.ok || response.status === 202) throw new Error('weltner.bookingUnknown');
  const text = await response.text();
  // The official client uses HTTP success, not a required response body.
  // Retain a provider ID when supplied; the local receipt never pretends to be it.
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('weltner.bookingUnknown');
  }
  if (!data || typeof data !== 'object') throw new Error('weltner.bookingUnknown');
  const row = data as Record<string, unknown>;
  if (
    row.success === false ||
    row.error ||
    ['pending', 'failed', 'rejected'].includes(String(row.status))
  )
    throw new Error('weltner.bookingUnknown');
  const id = row.bookingId ?? row.id;
  return typeof id === 'string' || typeof id === 'number' ? String(id) : null;
}
