import { ClubIntegrationType } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { BOOKING_ERROR_KEYS } from '@bandeja/shared/booking/errorKeys';
import { parseNspadelIntegrationConfig } from '../../shared/clubIntegration';

/**
 * Real booking endpoints for NS Padel Centar (Novi Sad).
 *
 * Upstream contract observed live 2026-09-08 in the club's own web bundle
 * (nspadel.rs) and verified against its public Supabase PostgREST API:
 * - `courts` rows carry opening/closing times, slot grid and durations;
 * - `POST /rest/v1/rpc/get_occupied_slots {_court_id,_date}` returns the
 *   occupied intervals; free slots are derived client-side with the same
 *   algorithm the club site uses;
 * - booking = insert into `reservations` with `status: 'confirmed'`.
 *
 * The club's Supabase anon key is a public client key (embedded in the club's
 * own JS) but it lives ONLY here, server-side, via NS_PADEL_SUPABASE_ANON_KEY.
 * It is never sent to, nor accepted from, the frontend.
 */

const NSPADEL_DURATIONS = [60, 90, 120];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export type NspadelUpstreamCourt = {
  id: string;
  name?: string | null;
  type?: string | null;
  opening_time?: string | null;
  closing_time?: string | null;
  slot_interval_minutes?: number | null;
  allowed_durations?: number[] | null;
};

export type NspadelFreeSlot = {
  courtId: string;
  courtName?: string;
  startTime: string;
  endTime: string;
};

function resolveAnonKey(): string {
  const key = process.env.NS_PADEL_SUPABASE_ANON_KEY?.trim();
  if (!key) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.nspadelSupabaseUrlRequired);
  }
  return key;
}

async function resolveClubSupabase(clubId: string): Promise<string> {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { integrationType: true, integrationConfig: true },
  });
  if (!club || club.integrationType !== ClubIntegrationType.NSPADELSUPABASE) {
    throw new ApiError(404, 'Club not found');
  }
  const config = parseNspadelIntegrationConfig(club.integrationConfig);
  if (!config) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.nspadelSupabaseUrlRequired);
  }
  return config.supabaseUrl;
}

async function upstreamFetch(
  supabaseUrl: string,
  pathWithQuery: string,
  options: { method?: string; body?: unknown } = {},
): Promise<unknown> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = {
    Accept: 'application/json',
    apikey: resolveAnonKey(),
    Authorization: `Bearer ${resolveAnonKey()}`,
    'User-Agent': 'BandejaNspadelProxy/1.0',
  };
  if (options.body !== undefined) {
    // No `Prefer: return=representation`: the club's `reservations` reads are
    // RLS-blocked, and this mirrors the club site's own insert call.
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${supabaseUrl}${pathWithQuery}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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
  if (!res.ok) {
    const message =
      (body as { message?: unknown } | null)?.message ??
      (body as { error?: unknown } | null)?.error ??
      `Upstream error ${res.status}`;
    throw new ApiError(502, typeof message === 'string' ? message : `Upstream error ${res.status}`);
  }
  return body;
}

export function parseTimeToMinutes(value: string): number | null {
  const match = TIME_RE.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function minutesToLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export type FreeSlotInput = {
  openingTime: string | null | undefined;
  closingTime: string | null | undefined;
  intervalMinutes: number | null | undefined;
  durationMinutes: number;
  occupied: Array<{ start_time: string; end_time: string }>;
  date: string;
  now?: Date;
};

/**
 * Port of the club site's own slot algorithm: walk the working-hours grid in
 * `intervalMinutes` steps, keep starts whose [start, start+duration) window
 * does not overlap an occupied interval, skip past starts when `date` is
 * today. Returns free *ranges* (consecutive starts merged) so callers can
 * complement them into busy snapshots.
 */
export function computeFreeRanges(input: FreeSlotInput): Array<{ start: number; end: number }> {
  const open = input.openingTime ? parseTimeToMinutes(input.openingTime.slice(0, 5)) : null;
  const close = input.closingTime ? parseTimeToMinutes(input.closingTime.slice(0, 5)) : null;
  const step =
    typeof input.intervalMinutes === 'number' && Number.isFinite(input.intervalMinutes) && input.intervalMinutes > 0
      ? Math.floor(input.intervalMinutes)
      : 30;
  if (open == null || close == null) return [];
  const occupied = (input.occupied ?? [])
    .map((row) => ({
      s: parseTimeToMinutes(String(row.start_time ?? '').slice(0, 5)),
      e: parseTimeToMinutes(String(row.end_time ?? '').slice(0, 5)),
    }))
    .filter((row): row is { s: number; e: number } => row.s != null && row.e != null && row.e > row.s);
  const now = input.now ?? new Date();
  // Local calendar day on both sides (the club site mixes UTC date with local
  // hours; local/local is the consistent choice for a server-side port).
  const pad = (n: number): string => String(n).padStart(2, '0');
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const isToday = input.date === todayKey;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const starts: number[] = [];
  for (let t = open; t + input.durationMinutes <= close; t += step) {
    const end = t + input.durationMinutes;
    if (isToday && t <= nowMinutes) continue;
    if (occupied.some((row) => t < row.e && end > row.s)) continue;
    starts.push(t);
  }
  const ranges: Array<{ start: number; end: number }> = [];
  for (const t of starts) {
    const last = ranges[ranges.length - 1];
    if (last && t <= last.end) {
      last.end = Math.max(last.end, t + input.durationMinutes);
    } else {
      ranges.push({ start: t, end: t + input.durationMinutes });
    }
  }
  return ranges;
}

export function assertBookingDate(date: string): void {
  if (!DATE_RE.test(date)) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.slotNoLongerAvailable);
  }
}

export function assertDuration(durationMinutes: number): void {
  if (!NSPADEL_DURATIONS.includes(durationMinutes)) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.slotNoLongerAvailable);
  }
}

async function fetchUpstreamCourts(supabaseUrl: string): Promise<NspadelUpstreamCourt[]> {
  const rows = (await upstreamFetch(
    supabaseUrl,
    '/rest/v1/courts?select=*&active=eq.true&order=type',
  )) as NspadelUpstreamCourt[] | null;
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === 'string') : [];
}

async function fetchOccupied(
  supabaseUrl: string,
  courtId: string,
  date: string,
): Promise<Array<{ start_time: string; end_time: string }>> {
  const rows = (await upstreamFetch(supabaseUrl, '/rest/v1/rpc/get_occupied_slots', {
    method: 'POST',
    body: { _court_id: courtId, _date: date },
  })) as Array<{ start_time: string; end_time: string }> | null;
  return Array.isArray(rows) ? rows : [];
}

export async function getNspadelAvailability(
  clubId: string,
  date: string,
  durationMinutes: number,
): Promise<{ slots: NspadelFreeSlot[] }> {
  assertBookingDate(date);
  assertDuration(durationMinutes);
  const supabaseUrl = await resolveClubSupabase(clubId);
  const courts = await fetchUpstreamCourts(supabaseUrl);
  const slots: NspadelFreeSlot[] = [];
  for (const court of courts) {
    const occupied = await fetchOccupied(supabaseUrl, court.id, date);
    const ranges = computeFreeRanges({
      openingTime: court.opening_time,
      closingTime: court.closing_time,
      intervalMinutes: court.slot_interval_minutes,
      durationMinutes,
      occupied,
      date,
    });
    for (const range of ranges) {
      slots.push({
        courtId: court.id,
        ...(court.name ? { courtName: court.name } : {}),
        startTime: minutesToLabel(range.start),
        endTime: minutesToLabel(range.end),
      });
    }
  }
  return { slots };
}

export type NspadelBookingInput = {
  clubId: string;
  userId: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
};

export type NspadelBookingResult = {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
};

/**
 * Exact `reservations` insert body the club's own site sends (field names
 * observed in its web bundle), plus `status: 'confirmed'`.
 */
export function buildReservationInsertBody(input: {
  courtId: string;
  courtType?: string | null;
  date: string;
  startMinutes: number;
  endMinutes: number;
  customerName: string;
  phone: string;
  email?: string | null;
}): Record<string, unknown> {
  return {
    court_id: input.courtId,
    ...(input.courtType ? { court_type: input.courtType } : {}),
    date: input.date,
    start_time: minutesToLabel(input.startMinutes),
    end_time: minutesToLabel(input.endMinutes),
    duration_minutes: input.endMinutes - input.startMinutes,
    customer_name: input.customerName,
    phone: input.phone,
    ...(input.email ? { email: input.email } : {}),
    status: 'confirmed',
  };
}

/**
 * Synthetic external booking id. The club's `reservations` reads are
 * RLS-blocked, so the upstream row id is not readable back; this key is
 * unique per court slot and is what Bandeja links games against.
 */
export function buildNspadelExternalBookingId(courtId: string, date: string, startTime: string): string {
  return `nspadel:${courtId}:${date}:${startTime}`;
}

export async function createNspadelBooking(input: NspadelBookingInput): Promise<NspadelBookingResult> {
  assertBookingDate(input.date);
  const start = parseTimeToMinutes(input.startTime);
  const end = parseTimeToMinutes(input.endTime);
  if (start == null || end == null || end <= start) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.slotNoLongerAvailable);
  }
  const durationMinutes = end - start;
  assertDuration(durationMinutes);

  const supabaseUrl = await resolveClubSupabase(input.clubId);
  const courts = await fetchUpstreamCourts(supabaseUrl);
  const court = courts.find((row) => row.id === input.courtId);
  if (!court) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.courtNotConfigured);
  }
  if (Array.isArray(court.allowed_durations) && !court.allowed_durations.includes(durationMinutes)) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.slotNoLongerAvailable);
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { firstName: true, lastName: true, phone: true, email: true },
  });
  const customerName = `${user?.firstName?.trim() ?? ''} ${user?.lastName?.trim() ?? ''}`.trim();
  const phone = user?.phone?.trim();
  if (!customerName || customerName.length < 2 || !phone || phone.length < 5) {
    throw new ApiError(400, BOOKING_ERROR_KEYS.nspadelProfileContactRequired);
  }

  const occupied = await fetchOccupied(supabaseUrl, court.id, input.date);
  const overlaps = occupied.some((row) => {
    const s = parseTimeToMinutes(String(row.start_time ?? '').slice(0, 5));
    const e = parseTimeToMinutes(String(row.end_time ?? '').slice(0, 5));
    return s != null && e != null && start < e && end > s;
  });
  if (overlaps) {
    throw new ApiError(409, BOOKING_ERROR_KEYS.slotNoLongerAvailable);
  }

  await upstreamFetch(supabaseUrl, '/rest/v1/reservations', {
    method: 'POST',
    body: buildReservationInsertBody({
      courtId: court.id,
      courtType: court.type,
      date: input.date,
      startMinutes: start,
      endMinutes: end,
      customerName,
      phone,
      email: user?.email,
    }),
  });

  return {
    id: buildNspadelExternalBookingId(court.id, input.date, minutesToLabel(start)),
    courtId: court.id,
    date: input.date,
    startTime: minutesToLabel(start),
    endTime: minutesToLabel(end),
    status: 'confirmed',
  };
}
