import { KLIKTEREN_API_URL } from './config';

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
};

export type KlikterenVenue = {
  id: string;
  name?: string;
  slug?: string;
  courts?: KlikterenVenueCourt[];
};

export type KlikterenAvailabilityResponse = {
  courtFreeSlots: Record<string, string[]>;
  courtBookedRanges?: Record<string, Array<{ startTime: string; endTime: string }>>;
  courtSlotConfig?: Record<
    string,
    {
      slot_length_minutes?: number;
      min_slots_per_booking?: number;
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
  return {
    id: pickString(row, 'id') ?? '',
    courtId:
      pickString(row, 'courtId', 'court_id') ??
      (court ? pickString(court, 'id') : null) ??
      '',
    venueId: pickString(row, 'venueId', 'venue_id') ?? undefined,
    date: pickString(row, 'date') ?? '',
    startTime: pickString(row, 'startTime', 'start_time') ?? '',
    endTime: pickString(row, 'endTime', 'end_time') ?? '',
    price: pickNumber(row, 'price', 'total_price'),
    status: pickString(row, 'status') ?? undefined,
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

export class KlikterenClient {
  private accessToken: string | null;
  private klikterenVenueId: string;
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
      credentials?: RequestCredentials;
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

    const res = await fetch(`${KLIKTEREN_API_URL}${path}`, {
      method,
      headers,
      credentials: options.credentials,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

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

  getVenue(venueId: string = this.klikterenVenueId): Promise<KlikterenVenue> {
    return this.request<KlikterenVenue>(`/api/venues/${encodeURIComponent(venueId)}`);
  }

  getAvailability(venueId: string, date: string): Promise<KlikterenAvailabilityResponse> {
    const params = new URLSearchParams({ date });
    return this.request<KlikterenAvailabilityResponse>(
      `/api/venues/${encodeURIComponent(venueId)}/availability?${params.toString()}`,
    );
  }

  getCourt(courtId: string): Promise<KlikterenVenueCourt> {
    return this.request<KlikterenVenueCourt>(`/api/courts/${encodeURIComponent(courtId)}`);
  }

  async login(email: string, password: string): Promise<KlikterenLoginResponse> {
    const data = await this.request<Record<string, unknown>>('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
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
    const data = await this.request<Record<string, unknown>>('/api/auth/session', {
      credentials: 'include',
    });
    const accessToken = pickString(data, 'access_token', 'accessToken');
    if (!accessToken) {
      throw Object.assign(new Error('Missing access token'), { status: 401, data });
    }
    return { access_token: accessToken };
  }

  async getMe(): Promise<KlikterenUser> {
    const data = await this.request<unknown>('/api/auth/me', {
      auth: true,
      credentials: 'include',
    });
    return normalizeUser(data);
  }

  signOut(): Promise<void> {
    return this.request<void>('/api/auth/signOut', {
      method: 'POST',
      auth: true,
      credentials: 'include',
    });
  }

  async getMyBookings(): Promise<KlikterenBooking[]> {
    const data = await this.request<unknown>('/api/bookings', { auth: true });
    const rows = Array.isArray(data) ? data : [];
    return rows.map(normalizeBooking).filter((row) => row.id && row.date && row.startTime);
  }

  async createBooking(body: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    extraEquipment?: Record<string, number>;
  }): Promise<KlikterenBooking> {
    const data = await this.request<unknown>('/api/bookings/create', {
      method: 'POST',
      auth: true,
      body,
    });
    return normalizeBooking(data);
  }

  cancelBooking(bookingId: string): Promise<void> {
    return this.request<void>('/api/bookings/cancel', {
      method: 'POST',
      auth: true,
      body: { bookingId, cancelledBy: 'user' },
    });
  }
}
