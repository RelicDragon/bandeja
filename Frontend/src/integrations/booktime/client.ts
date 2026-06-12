import { BOOKTIME_API_URL } from './config';

export type BooktimeUser = {
  uuid: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
};

export type BooktimeCompanyResource = {
  uuid?: string;
  bookingResourceId?: string;
  name?: string;
  serviceUuid?: string;
};

export type BooktimeCompany = {
  name?: string;
  currency?: string;
  timeInterval?: number;
  bookableDays?: number;
  bookingDurations?: number[];
  allowedHoursToCancel?: number;
  bookingResources?: BooktimeCompanyResource[];
};

export type BooktimeBookingRecord = {
  uuid: string;
  bookingStart: string;
  bookingEnd: string;
  bookingResourceId?: string;
  bookingResource?: { uuid?: string; bookingResourceId?: string; name?: string };
  status?: string;
};

export type BooktimeBookingsPage = {
  bookings: BooktimeBookingRecord[];
  totalCount?: number;
};

export type BooktimePriceQuote = {
  price?: number;
  currency?: string;
};

export type BooktimeCourtSlots = {
  uuid: string;
  name: string;
  availableSlots: string[];
};

export type BooktimeDayBooking = {
  bookingStart?: string;
  bookingEnd?: string;
  startTime?: string;
  endTime?: string;
};

export type BooktimeDayResource = {
  uuid?: string;
  bookingResourceId?: string;
  name?: string;
  bookings?: BooktimeDayBooking[];
  busySlots?: BooktimeDayBooking[];
};

export type BooktimeSessionPayload = {
  accessToken: string;
  refreshToken: string;
  user?: BooktimeUser;
};

export type BooktimeClientOptions = {
  companyId: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  onTokensUpdated?: (tokens: { accessToken: string; refreshToken: string }) => void;
  onSessionExpired?: () => void;
};

function formatPhone(countryCode: string, phoneNumber: string): string {
  const local = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
  return countryCode + local;
}

export class BooktimeClient {
  private accessToken: string | null;
  private refreshToken: string | null;
  private companyId: string;
  private onTokensUpdated?: (tokens: { accessToken: string; refreshToken: string }) => void;
  private onSessionExpired?: () => void;
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(options: BooktimeClientOptions) {
    this.companyId = options.companyId;
    this.accessToken = options.accessToken ?? null;
    this.refreshToken = options.refreshToken ?? null;
    this.onTokensUpdated = options.onTokensUpdated;
    this.onSessionExpired = options.onSessionExpired;
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  applyTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.onTokensUpdated?.({ accessToken, refreshToken });
  }

  clearSession(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  private async requestOnce<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {}
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
      throw Object.assign(new Error(message), { status: res.status, data });
    }

    return data as T;
  }

  expireSession(): void {
    this.clearSession();
    this.onSessionExpired?.();
  }

  async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      try {
        const data = await this.requestOnce<{
          accessToken?: string;
          refreshToken?: string;
        }>('/users/refresh-token', {
          method: 'PUT',
          body: { refreshToken: this.refreshToken! },
        });
        if (!data.accessToken) return false;
        this.applyTokens(data.accessToken, data.refreshToken ?? this.refreshToken!);
        return true;
      } catch {
        return false;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  async request<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {}
  ): Promise<T> {
    const auth = options.auth ?? false;
    try {
      return await this.requestOnce<T>(path, options);
    } catch (err) {
      const status = err && typeof err === 'object' && 'status' in err ? Number((err as { status: number }).status) : 0;
      if (auth && status === 401) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.requestOnce<T>(path, options);
        }
        this.expireSession();
      }
      throw err;
    }
  }

  formatPhone(countryCode: string, phoneNumber: string): string {
    return formatPhone(countryCode, phoneNumber);
  }

  async startPhoneLogin(countryCode: string, phoneNumber: string) {
    const phone = formatPhone(countryCode, phoneNumber);
    const data = await this.request<{ isUserExists?: boolean }>('/users/login', {
      method: 'POST',
      body: { phoneNumber: phone },
    });
    return {
      phoneNumber: phone,
      countryCode,
      localNumber: phoneNumber.replace(/\D/g, '').replace(/^0+/, ''),
      isUserExists: !!data.isUserExists,
    };
  }

  async sendCode(phoneNumber: string) {
    return this.request('/users/send-code', {
      method: 'PUT',
      body: { phoneNumber },
    });
  }

  async confirmLogin(phoneNumber: string, code: string, language = 'sr'): Promise<BooktimeSessionPayload> {
    const data = await this.request<BooktimeSessionPayload & { user?: BooktimeUser }>('/users/confirm-login', {
      method: 'POST',
      body: { phoneNumber, code, language },
    });
    if (!data.accessToken || !data.refreshToken) throw new Error('Incomplete login response');
    this.applyTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async signUp(params: {
    firstName: string;
    lastName: string;
    email: string;
    countryCode: string;
    phoneNumber: string;
  }) {
    const local = params.phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
    return this.request('/users/signup', {
      method: 'POST',
      body: {
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        countryCode: params.countryCode,
        phoneNumber: local,
        platform: 'web',
      },
    });
  }

  async confirmSignUp(phoneNumber: string, code: string, language = 'sr'): Promise<BooktimeSessionPayload> {
    const data = await this.request<BooktimeSessionPayload & { user?: BooktimeUser }>('/users/confirm-signup', {
      method: 'PUT',
      body: { phoneNumber, code, language },
    });
    if (!data.accessToken || !data.refreshToken) throw new Error('Incomplete signup response');
    this.applyTokens(data.accessToken, data.refreshToken);
    return data;
  }

  async acceptCustomTerms(): Promise<void> {
    try {
      await this.request('/users/accept-custom-terms', { method: 'PATCH', auth: true });
    } catch {
      /* non-blocking per plan */
    }
  }

  async getCompany() {
    return this.request<BooktimeCompany>(`/company/${this.companyId}`);
  }

  formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T00:00`;
  }

  async getAvailableSlots(date: Date, dateKey?: string) {
    const dateParam = dateKey ? `${dateKey}T00:00` : this.formatDate(date);
    return this.request<BooktimeCourtSlots[]>('/booking-resources/get-available-slots', {
      method: 'POST',
      body: { date: dateParam },
    });
  }

  async getForDay(date: Date) {
    return this.request<BooktimeDayResource[]>('/booking-resources/get-for-day', {
      method: 'POST',
      auth: true,
      body: { date: this.formatDate(date) },
    });
  }

  async getPrice(params: { bookingStart: string; bookingEnd: string; serviceUuid: string }) {
    return this.request<BooktimePriceQuote>('/booking/get-price', {
      method: 'POST',
      auth: true,
      body: params,
    });
  }

  async createBooking(params: {
    bookingStart: string;
    bookingEnd: string;
    userId: string;
    bookingResourceId: string;
    serviceId: string;
    description?: string;
  }) {
    return this.request<BooktimeBookingRecord>('/booking', {
      method: 'POST',
      auth: true,
      body: {
        bookingStart: params.bookingStart,
        bookingEnd: params.bookingEnd,
        userId: params.userId,
        bookingResourceId: params.bookingResourceId,
        serviceId: params.serviceId,
        description: params.description ?? '',
      },
    });
  }

  async cancelBooking(bookingId: string) {
    return this.request<void>(`/booking/cancel?bookingId=${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      auth: true,
    });
  }

  async getUpcomingBookings(index = 0, size = 20) {
    return this.request<BooktimeBookingsPage>('/booking/get-upcoming', {
      method: 'POST',
      auth: true,
      body: { index, size },
    });
  }

  async getPreviousBookings(index = 0, size = 20) {
    return this.request<BooktimeBookingsPage>('/booking/get-previous', {
      method: 'POST',
      auth: true,
      body: { index, size },
    });
  }
}
