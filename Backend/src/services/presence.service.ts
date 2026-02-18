const ACTIVITY_TTL_MS = 2 * 60 * 1000;
const EXPIRY_CHECK_MS = 30_000;

export type PresenceNotifier = (userId: string, online: boolean) => void;

class PresenceService {
  private lastActivityByUser = new Map<string, number>();
  private notifier: PresenceNotifier | null = null;
  private expiryInterval: NodeJS.Timeout | null = null;

  setNotifier(fn: PresenceNotifier): void {
    this.notifier = fn;
  }

  recordActivity(userId: string): void {
    if (!userId) return;
    const now = Date.now();
    const wasOnline = this.isUserOnline(userId);
    this.lastActivityByUser.set(userId, now);
    if (!wasOnline && this.notifier) {
      this.notifier(userId, true);
    }
  }

  isUserOnline(userId: string): boolean {
    const ts = this.lastActivityByUser.get(userId);
    if (ts == null) return false;
    return Date.now() - ts < ACTIVITY_TTL_MS;
  }

  getAllOnlineUserIds(): string[] {
    const now = Date.now();
    const ids: string[] = [];
    for (const [userId, ts] of this.lastActivityByUser) {
      if (now - ts < ACTIVITY_TTL_MS) ids.push(userId);
    }
    return ids;
  }

  startExpiryLoop(): void {
    if (this.expiryInterval) return;
    this.expiryInterval = setInterval(() => {
      const now = Date.now();
      for (const [userId, ts] of this.lastActivityByUser) {
        if (now - ts >= ACTIVITY_TTL_MS) {
          this.lastActivityByUser.delete(userId);
          if (this.notifier) this.notifier(userId, false);
        }
      }
    }, EXPIRY_CHECK_MS);
  }

  stop(): void {
    if (this.expiryInterval) {
      clearInterval(this.expiryInterval);
      this.expiryInterval = null;
    }
    this.notifier = null;
    this.lastActivityByUser.clear();
  }
}

export const presenceService = new PresenceService();
