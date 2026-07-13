import { PADELOO_API_URL } from './config';

export type PadelooUser = {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
};

export type PadelooClubCourt = {
  id: number;
  name: string;
  isIndoor?: boolean;
  allowedDurations?: number[];
};

export type PadelooClub = {
  id: number;
  name?: string;
  cancellationHours?: number;
  defaultAdvanceBookingDays?: number;
  courts?: PadelooClubCourt[];
  workingHours?: Array<{ dayOfWeek: number; openAt: string; closeAt: string }>;
};

export type PadelooAvailableSlot = {
  startTime: string;
  endTime: string;
  price?: number;
};

export type PadelooAvailableCourtRow = {
  courtId: number;
  courtName: string;
  date: string;
  durationMinutes: number;
  price?: number;
  slots: PadelooAvailableSlot[];
};

export type PadelooReservation = {
  id: number;
  courtId: number;
  clubId: number;
  date: string;
  startTime: string;
  endTime: string;
  price?: number;
  status?: string;
};

export type PadelooVerifyCodeResponse = {
  success?: boolean;
  token: string;
  user: PadelooUser;
};

export type PadelooClientOptions = {
  padelooClubId: number;
  accessToken?: string | null;
  onTokenUpdated?: (accessToken: string) => void;
  onSessionExpired?: () => void;
};

export class PadelooClient {
  private accessToken: string | null;
  private padelooClubId: number;
  private onTokenUpdated?: (accessToken: string) => void;
  private onSessionExpired?: () => void;

  constructor(options: PadelooClientOptions) {
    this.padelooClubId = options.padelooClubId;
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
    options: { method?: string; body?: Record<string, unknown>; auth?: boolean } = {},
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

    const res = await fetch(`${PADELOO_API_URL}${path}`, {
      method,
      headers,
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
      throw Object.assign(new Error(message), { status: res.status, data });
    }

    return data as T;
  }

  getClub(clubId: number = this.padelooClubId): Promise<PadelooClub> {
    return this.request<PadelooClub>(`/Club/${clubId}`);
  }

  getAvailableSlots(
    clubId: number,
    date: string,
    durationMinutes: number,
  ): Promise<PadelooAvailableCourtRow[]> {
    const params = new URLSearchParams({
      date,
      durationMinutes: String(durationMinutes),
    });
    return this.request<PadelooAvailableCourtRow[]>(
      `/Club/${clubId}/available-slots?${params.toString()}`,
    );
  }

  sendCode(email: string): Promise<void> {
    return this.request<void>('/Auth/send-code', {
      method: 'POST',
      body: { email },
    });
  }

  verifyCode(email: string, code: string): Promise<PadelooVerifyCodeResponse> {
    return this.request<PadelooVerifyCodeResponse>('/Auth/verify-code', {
      method: 'POST',
      body: { email, code },
    });
  }

  createReservation(body: {
    clubId: number;
    courtId: number;
    date: string;
    startTime: string;
    durationMinutes: number;
  }): Promise<PadelooReservation> {
    return this.request<PadelooReservation>('/Reservation', {
      method: 'POST',
      auth: true,
      body,
    });
  }

  getMyReservations(): Promise<PadelooReservation[]> {
    return this.request<PadelooReservation[]>('/Reservation/my', { auth: true });
  }

  cancelReservation(reservationId: number | string): Promise<void> {
    return this.request<void>(`/Reservation/${reservationId}`, {
      method: 'DELETE',
      auth: true,
    });
  }
}
