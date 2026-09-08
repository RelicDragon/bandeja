import { getNspadelApiUrl } from './config';

/**
 * NS Padel Centar client. Availability and booking go through real Bandeja
 * backend endpoints (`GET /nspadel/availability`, `POST /nspadel/bookings`),
 * which call the club's Supabase project server-side. Nothing here hardcodes
 * the Supabase URL or anon key: those live in backend env / the club's
 * `integrationConfig` and are resolved server-side per club.
 *
 * The club upstream exposes no per-user bookings listing or cancellation API,
 * so `getMyBookings` returns [] and `cancelBooking` throws the
 * `nspadelCancelViaClub` key (cancel by contacting the club directly).
 * When the club is not configured yet the backend answers 400 with
 * `errors.booking.nspadelSupabaseUrlRequired` — callers treat that as "no
 * data" so the club page still renders.
 */

export type NspadelClientOptions = {
  clubId: string;
  accessToken?: string | null;
};

export type NspadelAvailabilitySlot = {
  courtId: string;
  courtName?: string;
  startTime: string;
  endTime: string;
};

export type NspadelAvailabilityResponse = {
  slots: NspadelAvailabilitySlot[];
};

export type NspadelBooking = {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  price?: number;
  status?: string;
};

export function isNspadelClubNotConfiguredError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const status = (err as { status?: unknown })?.status;
  return (
    status === 400 &&
    /clubNotConfigured|nspadelSupabaseUrlRequired|not configured|supabase.*required/i.test(message)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function pickNumber(raw: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function normalizeTimeLabel(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return value.trim();
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function normalizeSlot(raw: unknown): NspadelAvailabilitySlot | null {
  const row = asRecord(raw);
  if (!row) return null;
  const courtId = pickString(row, 'courtId', 'court_id', 'externalCourtId', 'court');
  const start = pickString(row, 'startTime', 'start_time', 'start');
  const end = pickString(row, 'endTime', 'end_time', 'end');
  if (!courtId || !start || !end) return null;
  return {
    courtId,
    courtName: pickString(row, 'courtName', 'court_name', 'name') ?? undefined,
    startTime: normalizeTimeLabel(start),
    endTime: normalizeTimeLabel(end),
  };
}

function normalizeBooking(raw: unknown): NspadelBooking | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row, 'id', 'booking_id');
  const courtId = pickString(row, 'courtId', 'court_id');
  const date = pickString(row, 'date');
  const start = pickString(row, 'startTime', 'start_time', 'start');
  const end = pickString(row, 'endTime', 'end_time', 'end');
  if (!id || !courtId || !date || !start || !end) return null;
  return {
    id,
    courtId,
    date,
    startTime: normalizeTimeLabel(start),
    endTime: normalizeTimeLabel(end),
    price: pickNumber(row, 'price', 'total_price'),
    status: pickString(row, 'status') ?? undefined,
  };
}

const REQUEST_TIMEOUT_MS = 15_000;

export class NspadelClient {
  private readonly clubId: string;
  private accessToken: string | null;

  constructor(options: NspadelClientOptions) {
    this.clubId = options.clubId;
    this.accessToken = options.accessToken ?? null;
  }

  applyToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  clearSession(): void {
    this.accessToken = null;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {},
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.auth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    const url =
      `${getNspadelApiUrl()}${path}` +
      `${path.includes('?') ? '&' : '?'}clubId=${encodeURIComponent(this.clubId)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw Object.assign(new Error('Request timed out'), { status: 408 });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    const errBody = data as { message?: string; error?: string } | null;
    const message =
      (typeof errBody?.message === 'string' && errBody.message) ||
      (typeof errBody?.error === 'string' && errBody.error) ||
      res.statusText;
    if (!res.ok) {
      throw Object.assign(new Error(message), { status: res.status, data });
    }
    return data as T;
  }

  async getAvailability(dateKey: string, durationMinutes?: number): Promise<NspadelAvailabilityResponse> {
    const params = new URLSearchParams({ date: dateKey });
    if (durationMinutes) params.set('durationMinutes', String(durationMinutes));
    const data = await this.request<unknown>(`/availability?${params.toString()}`);
    const root = asRecord(data);
    // The backend wraps payloads as { success, data }; accept bare arrays too.
    const envelope = asRecord(root?.data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(root?.slots)
        ? root!.slots
        : Array.isArray(root?.data)
          ? root!.data
          : Array.isArray(envelope?.slots)
            ? envelope!.slots
            : [];
    return {
      slots: rows.map(normalizeSlot).filter((s): s is NspadelAvailabilitySlot => s != null),
    };
  }

  async getMyBookings(): Promise<NspadelBooking[]> {
    // The club upstream has no per-user bookings listing (its own site has no
    // such feature either); bookings made through Bandeja are linked to games
    // via snapshots instead.
    return [];
  }

  async createBooking(body: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
  }): Promise<NspadelBooking> {
    const data = await this.request<unknown>('/bookings', {
      method: 'POST',
      auth: true,
      body: {
        courtId: body.courtId,
        date: body.date,
        startTime: normalizeTimeLabel(body.startTime),
        endTime: normalizeTimeLabel(body.endTime),
      },
    });
    const root = asRecord(data);
    const booking = normalizeBooking(root?.booking ?? root?.data ?? data);
    if (!booking) throw new Error('Booking creation returned no booking');
    return booking;
  }

  async cancelBooking(_bookingId: string): Promise<void> {
    // The club upstream exposes no cancellation API; cancellations go through
    // the club directly (phone on the club page).
    throw Object.assign(new Error('errors.booking.nspadelCancelViaClub'), { status: 400 });
  }
}
