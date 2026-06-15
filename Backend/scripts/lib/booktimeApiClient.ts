import { booktimeIngestToStoredUtcIso } from '../../src/shared/booktime/localTime';

const BOOKTIME_API_URL = 'https://api.booktime.rs';

export type BooktimeWireBooking = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
};

type BooktimeBookingsPage = {
  bookings: BooktimeWireBooking[];
  totalCount?: number;
};

export type NormalizedBooktimeBooking = {
  externalBookingId: string;
  bookingStart: string;
  bookingEnd: string;
  wireStart: string;
  wireEnd: string;
};

export class BooktimeScriptClient {
  private accessToken: string;
  private refreshToken: string;
  private companyId: string;
  private onTokensUpdated?: (tokens: { accessToken: string; refreshToken: string }) => void;

  constructor(options: {
    companyId: string;
    accessToken: string;
    refreshToken: string;
    onTokensUpdated?: (tokens: { accessToken: string; refreshToken: string }) => void;
  }) {
    this.companyId = options.companyId;
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
    this.onTokensUpdated = options.onTokensUpdated;
  }

  private async requestOnce<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {},
  ): Promise<T> {
    const method = options.method ?? 'GET';
    const auth = options.auth ?? false;
    const url =
      auth && this.accessToken
        ? `${BOOKTIME_API_URL}${path}`
        : `${BOOKTIME_API_URL}/public${path}`;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const payload = options.body ? { ...options.body, companyId: this.companyId } : undefined;
    const res = await fetch(url, {
      method,
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    const text = await res.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    const errBody = data as { errorCode?: string; message?: string; error?: string } | null;
    const message =
      (typeof errBody?.message === 'string' && errBody.message) ||
      (typeof errBody?.error === 'string' && errBody.error) ||
      (typeof errBody?.errorCode === 'string' && errBody.errorCode) ||
      res.statusText;

    if (!res.ok) {
      throw Object.assign(new Error(message), { status: res.status });
    }

    return data as T;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {},
  ): Promise<T> {
    const auth = options.auth ?? false;
    try {
      return await this.requestOnce<T>(path, options);
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
      if (auth && status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.requestOnce<T>(path, options);
        }
      }
      throw err;
    }
  }

  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    try {
      const data = await this.requestOnce<{
        accessToken?: string;
        refreshToken?: string;
      }>('/users/refresh-token', {
        method: 'PUT',
        body: { refreshToken: this.refreshToken },
      });
      if (!data.accessToken) return false;
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken ?? this.refreshToken;
      this.onTokensUpdated?.({ accessToken: this.accessToken, refreshToken: this.refreshToken });
      return true;
    } catch {
      return false;
    }
  }

  private normalizeBooking(
    booking: BooktimeWireBooking,
    timeZone: string,
  ): NormalizedBooktimeBooking {
    const bookingStart =
      booktimeIngestToStoredUtcIso(booking.bookingStart, timeZone) ?? booking.bookingStart;
    const bookingEnd =
      booktimeIngestToStoredUtcIso(booking.bookingEnd, timeZone) ?? booking.bookingEnd;
    return {
      externalBookingId: booking.uuid,
      bookingStart,
      bookingEnd,
      wireStart: booking.bookingStart,
      wireEnd: booking.bookingEnd,
    };
  }

  private async fetchBookingsPage(
    path: '/booking/get-upcoming' | '/booking/get-previous',
    index: number,
    size: number,
  ): Promise<BooktimeBookingsPage> {
    return this.request<BooktimeBookingsPage>(path, {
      method: 'POST',
      auth: true,
      body: { index, size },
    });
  }

  async loadBookingsById(
    externalBookingIds: Set<string>,
    timeZone: string,
    pageSize = 50,
  ): Promise<Map<string, NormalizedBooktimeBooking>> {
    const found = new Map<string, NormalizedBooktimeBooking>();
    if (externalBookingIds.size === 0) return found;

    const paths = ['/booking/get-upcoming', '/booking/get-previous'] as const;
    for (const path of paths) {
      let index = 0;
      for (;;) {
        const page = await this.fetchBookingsPage(path, index, pageSize);
        const bookings = Array.isArray(page.bookings) ? page.bookings : [];
        for (const booking of bookings) {
          if (!externalBookingIds.has(booking.uuid)) continue;
          found.set(booking.uuid, this.normalizeBooking(booking, timeZone));
        }
        if (found.size >= externalBookingIds.size) return found;
        if (bookings.length < pageSize) break;
        index += pageSize;
      }
    }

    return found;
  }
}
