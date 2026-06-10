import {
  BOOKTIME_API_URL,
  BOOKTIME_TEST_STORAGE_KEYS,
  PADEL_CITY_COMPANY_ID,
} from './config';

export type BooktimeRequestLog = {
  method: string;
  path: string;
  ok: boolean;
  status: number;
  cors: 'ok' | 'blocked' | 'unknown';
  message: string;
  at: string;
};

export type BooktimeUser = {
  uuid: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
};

export type BooktimeCompany = {
  name?: string;
  currency?: string;
  timeInterval?: number;
  bookableDays?: number;
  bookingDurations?: number[];
  bookingResources?: Array<{ uuid: string; name: string }>;
};

export type BooktimeCourtSlots = {
  uuid: string;
  name: string;
  availableSlots: string[];
};

function corsFromError(err: unknown): BooktimeRequestLog['cors'] {
  if (err instanceof TypeError && /fetch|network|cors/i.test(err.message)) {
    return 'blocked';
  }
  return 'unknown';
}

function formatPhone(countryCode: string, phoneNumber: string): string {
  const local = phoneNumber.replace(/\D/g, '').replace(/^0+/, '');
  return countryCode + local;
}

function readStoredUser(): BooktimeUser | null {
  const raw = sessionStorage.getItem(BOOKTIME_TEST_STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BooktimeUser;
  } catch {
    return null;
  }
}

export class BooktimeClient {
  private accessToken: string | null;
  private companyId: string;

  constructor(companyId = PADEL_CITY_COMPANY_ID) {
    this.companyId = companyId;
    this.accessToken = sessionStorage.getItem(BOOKTIME_TEST_STORAGE_KEYS.accessToken);
  }

  get isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  getUser(): BooktimeUser | null {
    return readStoredUser();
  }

  clearSession(): void {
    this.accessToken = null;
    sessionStorage.removeItem(BOOKTIME_TEST_STORAGE_KEYS.accessToken);
    sessionStorage.removeItem(BOOKTIME_TEST_STORAGE_KEYS.refreshToken);
    sessionStorage.removeItem(BOOKTIME_TEST_STORAGE_KEYS.user);
  }

  private storeSession(data: {
    accessToken?: string;
    refreshToken?: string;
    user?: BooktimeUser;
  }): void {
    if (data.accessToken) {
      this.accessToken = data.accessToken;
      sessionStorage.setItem(BOOKTIME_TEST_STORAGE_KEYS.accessToken, data.accessToken);
    }
    if (data.refreshToken) {
      sessionStorage.setItem(BOOKTIME_TEST_STORAGE_KEYS.refreshToken, data.refreshToken);
    }
    if (data.user) {
      sessionStorage.setItem(BOOKTIME_TEST_STORAGE_KEYS.user, JSON.stringify(data.user));
    }
  }

  async request<T>(
    path: string,
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {}
  ): Promise<{ data: T; log: BooktimeRequestLog }> {
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

    try {
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

      const log: BooktimeRequestLog = {
        method,
        path,
        ok: res.ok,
        status: res.status,
        cors: 'ok',
        message: res.ok ? 'OK' : message,
        at: new Date().toISOString(),
      };

      if (!res.ok) {
        throw Object.assign(new Error(message), { log, data });
      }

      return { data: data as T, log };
    } catch (err) {
      if (err && typeof err === 'object' && 'log' in err) {
        throw err;
      }
      const log: BooktimeRequestLog = {
        method,
        path,
        ok: false,
        status: 0,
        cors: corsFromError(err),
        message: err instanceof Error ? err.message : 'Request failed',
        at: new Date().toISOString(),
      };
      throw Object.assign(new Error(log.message), { log });
    }
  }

  formatPhone(countryCode: string, phoneNumber: string): string {
    return formatPhone(countryCode, phoneNumber);
  }

  async startPhoneLogin(countryCode: string, phoneNumber: string) {
    const phone = formatPhone(countryCode, phoneNumber);
    const { data, log } = await this.request<{ isUserExists?: boolean }>('/users/login', {
      method: 'POST',
      body: { phoneNumber: phone },
    });
    return {
      phoneNumber: phone,
      countryCode,
      localNumber: phoneNumber.replace(/\D/g, '').replace(/^0+/, ''),
      isUserExists: !!data.isUserExists,
      log,
    };
  }

  async sendCode(phoneNumber: string) {
    return this.request('/users/send-code', {
      method: 'PUT',
      body: { phoneNumber },
    });
  }

  async confirmLogin(phoneNumber: string, code: string, language = 'sr') {
    const { data, log } = await this.request<{
      accessToken?: string;
      refreshToken?: string;
      user?: BooktimeUser;
    }>('/users/confirm-login', {
      method: 'POST',
      body: { phoneNumber, code, language },
    });
    if (!data.accessToken) throw new Error('No access token in response');
    this.storeSession(data);
    return { ...data, log };
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

  async confirmSignUp(phoneNumber: string, code: string, language = 'sr') {
    const { data, log } = await this.request<{
      accessToken?: string;
      refreshToken?: string;
      user?: BooktimeUser;
    }>('/users/confirm-signup', {
      method: 'PUT',
      body: { phoneNumber, code, language },
    });
    if (!data.accessToken) throw new Error('No access token in response');
    this.storeSession(data);
    return { ...data, log };
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

  async getAvailableSlots(date: Date) {
    return this.request<BooktimeCourtSlots[]>('/booking-resources/get-available-slots', {
      method: 'POST',
      body: { date: this.formatDate(date) },
    });
  }

  async getUpcomingBookings() {
    return this.request<unknown[]>('/booking/get-upcoming', {
      method: 'POST',
      auth: true,
      body: { index: 0, size: 5 },
    });
  }
}
