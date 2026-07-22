import { getKlikterenApiUrl } from './config';

export type KlikterenUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
};

export type KlikterenVenueCourt = {
  id: string;
  name: string;
  isIndoor?: boolean;
  autoOpenDays?: number;
  sportType?: string;
};

export type KlikterenVenue = {
  id: string;
  name?: string;
  slug?: string;
  courts?: KlikterenVenueCourt[];
};

export type KlikterenAvailabilityResponse = {
  courtFreeSlots: Record<string, string[]>;
  courtBookedRanges: Record<string, Array<{ startTime: string; endTime: string }>>;
  courtDateClosedByOwner: Record<string, boolean>;
  courtSlotConfig: Record<
    string,
    {
      slotLengthMinutes: number;
      minSlotsPerBooking: number;
    }
  >;
};

export type KlikterenBooking = {
  id: string;
  courtId: string;
  venueId?: string;
  date: string;
  startTime: string;
  endTime: string;
  price?: number;
  status?: string;
};

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

function pickBool(raw: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === 'boolean') return value;
  }
  return undefined;
}

function normalizeTimeLabel(value: string): string {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return value.trim();
  return `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function normalizeUser(raw: unknown): KlikterenUser {
  const row = asRecord(raw) ?? {};
  const id = pickString(row, 'id', 'user_id') ?? '';
  const email = pickString(row, 'email') ?? '';
  const firstName = pickString(row, 'firstName', 'first_name', 'full_name') ?? undefined;
  const lastName = pickString(row, 'lastName', 'last_name') ?? undefined;
  return { id, email, firstName, lastName };
}

function normalizeBooking(raw: unknown): KlikterenBooking {
  const row = asRecord(raw) ?? {};
  const court = asRecord(row.court);
  const startRaw = pickString(row, 'startTime', 'start_time', 'start') ?? '';
  const endRaw = pickString(row, 'endTime', 'end_time', 'end') ?? '';
  return {
    id: pickString(row, 'id') ?? '',
    courtId:
      pickString(row, 'courtId', 'court_id') ??
      (court ? pickString(court, 'id') : null) ??
      '',
    venueId: pickString(row, 'venueId', 'venue_id') ?? undefined,
    date: pickString(row, 'date') ?? '',
    startTime: startRaw ? normalizeTimeLabel(startRaw) : '',
    endTime: endRaw ? normalizeTimeLabel(endRaw) : '',
    price: pickNumber(row, 'price', 'total_price'),
    status: pickString(row, 'status') ?? undefined,
  };
}

function normalizeCourt(raw: unknown): KlikterenVenueCourt | null {
  const row = asRecord(raw);
  if (!row) return null;
  const id = pickString(row, 'id');
  const name = pickString(row, 'name');
  if (!id || !name) return null;
  return {
    id,
    name,
    isIndoor: pickBool(row, 'isIndoor', 'is_indoor'),
    autoOpenDays: pickNumber(row, 'autoOpenDays', 'auto_open_days'),
    sportType: pickString(row, 'sportType', 'sport_type') ?? undefined,
  };
}

function normalizeVenue(raw: unknown): KlikterenVenue {
  const root = asRecord(raw) ?? {};
  const row = asRecord(root.data) ?? root;
  const courtsRaw = row.courts;
  const courts = Array.isArray(courtsRaw)
    ? courtsRaw.map(normalizeCourt).filter((c): c is KlikterenVenueCourt => c != null)
    : undefined;
  return {
    id: pickString(row, 'id') ?? '',
    name: pickString(row, 'name') ?? undefined,
    slug: pickString(row, 'slug') ?? undefined,
    courts,
  };
}

function normalizeBookedRange(raw: unknown): { startTime: string; endTime: string } | null {
  const row = asRecord(raw);
  if (!row) return null;
  const start = pickString(row, 'startTime', 'start_time', 'start');
  const end = pickString(row, 'endTime', 'end_time', 'end');
  if (!start || !end) return null;
  return { startTime: normalizeTimeLabel(start), endTime: normalizeTimeLabel(end) };
}

function normalizeStringMap(raw: unknown): Record<string, string[]> {
  const row = asRecord(raw);
  if (!row) return {};
  const out: Record<string, string[]> = {};
  for (const [courtId, value] of Object.entries(row)) {
    if (!Array.isArray(value)) continue;
    out[courtId] = value
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeTimeLabel);
  }
  return out;
}

function normalizeAvailability(raw: unknown): KlikterenAvailabilityResponse {
  const root = asRecord(raw) ?? {};
  const row = asRecord(root.data) ?? root;
  const camelFree = normalizeStringMap(row.courtFreeSlots);
  const freeSlots =
    Object.keys(camelFree).length > 0 ? camelFree : normalizeStringMap(row.court_free_slots);

  const bookedRaw = asRecord(row.courtBookedRanges) ?? asRecord(row.court_booked_ranges) ?? {};
  const courtBookedRanges: Record<string, Array<{ startTime: string; endTime: string }>> = {};
  for (const [courtId, ranges] of Object.entries(bookedRaw)) {
    if (!Array.isArray(ranges)) continue;
    courtBookedRanges[courtId] = ranges
      .map(normalizeBookedRange)
      .filter((r): r is { startTime: string; endTime: string } => r != null);
  }

  const closedRaw =
    asRecord(row.courtDateClosedByOwner) ?? asRecord(row.court_date_closed_by_owner) ?? {};
  const courtDateClosedByOwner: Record<string, boolean> = {};
  for (const [courtId, value] of Object.entries(closedRaw)) {
    if (typeof value === 'boolean') courtDateClosedByOwner[courtId] = value;
  }

  const configRaw = asRecord(row.courtSlotConfig) ?? asRecord(row.court_slot_config) ?? {};
  const courtSlotConfig: KlikterenAvailabilityResponse['courtSlotConfig'] = {};
  for (const [courtId, value] of Object.entries(configRaw)) {
    const cfg = asRecord(value);
    if (!cfg) continue;
    courtSlotConfig[courtId] = {
      slotLengthMinutes: pickNumber(cfg, 'slotLengthMinutes', 'slot_length_minutes') ?? 30,
      minSlotsPerBooking: pickNumber(cfg, 'minSlotsPerBooking', 'min_slots_per_booking') ?? 2,
    };
  }

  return {
    courtFreeSlots: freeSlots,
    courtBookedRanges,
    courtDateClosedByOwner,
    courtSlotConfig,
  };
}

export type KlikterenLoginResponse = {
  access_token?: string;
  user?: KlikterenUser;
};

export type KlikterenSessionResponse = {
  access_token: string;
};

export type KlikterenClientOptions = {
  klikterenVenueId: string;
  accessToken?: string | null;
  onTokenUpdated?: (accessToken: string) => void;
  onSessionExpired?: () => void;
};

const REQUEST_TIMEOUT_MS = 15_000;

export class KlikterenClient {
  private accessToken: string | null;
  private klikterenVenueId: string;
  private upstreamCookie: string | null = null;
  private onTokenUpdated?: (accessToken: string) => void;
  private onSessionExpired?: () => void;

  constructor(options: KlikterenClientOptions) {
    this.klikterenVenueId = options.klikterenVenueId;
    this.accessToken = options.accessToken ?? null;
    this.onTokenUpdated = options.onTokenUpdated;
    this.onSessionExpired = options.onSessionExpired;
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  applyToken(accessToken: string): void {
    this.accessToken = accessToken;
    this.onTokenUpdated?.(accessToken);
  }

  clearSession(): void {
    this.accessToken = null;
    this.upstreamCookie = null;
  }

  expireSession(): void {
    this.clearSession();
    this.onSessionExpired?.();
  }

  private async request<T>(
    path: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      auth?: boolean;
    } = {},
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const auth = options.auth ?? false;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    if (auth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }
    if (this.upstreamCookie) {
      headers['X-Klikteren-Cookie'] = this.upstreamCookie;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${getKlikterenApiUrl()}${path}`, {
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

    const setCookies = res.headers.getSetCookie?.() ?? [];
    const legacyCookie = res.headers.get('x-klikteren-set-cookie');
    const cookieParts = [
      ...setCookies,
      ...(legacyCookie ? legacyCookie.split(/,(?=[^;]+?=)/) : []),
    ]
      .map((part) => part.split(';')[0]?.trim())
      .filter((part): part is string => !!part);
    if (cookieParts.length > 0) {
      this.upstreamCookie = cookieParts.join('; ');
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
      if (auth && (res.status === 401 || res.status === 403)) {
        this.expireSession();
      }
      throw Object.assign(new Error(message), { status: res.status, data });
    }

    return data as T;
  }

  async getVenue(venueId: string = this.klikterenVenueId): Promise<KlikterenVenue> {
    const data = await this.request<unknown>(`/api/venues/${encodeURIComponent(venueId)}`);
    return normalizeVenue(data);
  }

  async getAvailability(venueId: string, date: string): Promise<KlikterenAvailabilityResponse> {
    const params = new URLSearchParams({ date });
    const data = await this.request<unknown>(
      `/api/venues/${encodeURIComponent(venueId)}/availability?${params.toString()}`,
    );
    return normalizeAvailability(data);
  }

  async getCourt(courtId: string): Promise<KlikterenVenueCourt> {
    const data = await this.request<unknown>(`/api/courts/${encodeURIComponent(courtId)}`);
    return normalizeCourt(data) ?? { id: courtId, name: courtId };
  }

  async login(email: string, password: string): Promise<KlikterenLoginResponse> {
    const data = await this.request<Record<string, unknown>>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const accessToken =
      pickString(data, 'access_token', 'accessToken') ??
      pickString(asRecord(data.session) ?? {}, 'access_token', 'accessToken');
    const userRaw = data.user ?? data;
    return {
      access_token: accessToken ?? undefined,
      user: normalizeUser(userRaw),
    };
  }

  async getSession(): Promise<KlikterenSessionResponse> {
    const data = await this.request<Record<string, unknown>>('/api/auth/session');
    const accessToken = pickString(data, 'access_token', 'accessToken');
    if (!accessToken) {
      throw Object.assign(new Error('Missing access token'), { status: 401, data });
    }
    return { access_token: accessToken };
  }

  async getMe(): Promise<KlikterenUser> {
    const data = await this.request<unknown>('/api/auth/me', { auth: true });
    return normalizeUser(data);
  }

  signOut(): Promise<void> {
    return this.request<void>('/api/auth/signOut', {
      method: 'POST',
      auth: true,
    });
  }

  async getMyBookings(): Promise<KlikterenBooking[]> {
    const data = await this.request<unknown>('/api/bookings', { auth: true });
    const root = asRecord(data);
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(root?.bookings)
        ? root!.bookings
        : Array.isArray(root?.data)
          ? root!.data
          : [];
    return rows.map(normalizeBooking).filter((row) => row.id && row.date && row.startTime);
  }

  async createBooking(body: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    extraEquipment?: Record<string, number>;
  }): Promise<KlikterenBooking> {
    const payload: Record<string, unknown> = {
      court_id: body.courtId,
      date: body.date,
      start_time: normalizeTimeLabel(body.startTime),
      end_time: normalizeTimeLabel(body.endTime),
      courtId: body.courtId,
      startTime: normalizeTimeLabel(body.startTime),
      endTime: normalizeTimeLabel(body.endTime),
    };
    if (body.extraEquipment) {
      payload.extra_equipment = body.extraEquipment;
      payload.extraEquipment = body.extraEquipment;
    }
    const data = await this.request<unknown>('/api/bookings/create', {
      method: 'POST',
      auth: true,
      body: payload,
    });
    const root = asRecord(data);
    return normalizeBooking(root?.booking ?? root?.data ?? data);
  }

  cancelBooking(bookingId: string): Promise<void> {
    return this.request<void>('/api/bookings/cancel', {
      method: 'POST',
      auth: true,
      body: { bookingId, cancelledBy: 'user' },
    });
  }
}
