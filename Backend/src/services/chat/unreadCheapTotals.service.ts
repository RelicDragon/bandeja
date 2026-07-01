import { UnreadCountQuery } from './unreadCountQuery';

export class UnreadCheapTotalsService {
  /** Batched context counts only — no game/chat object hydration. */
  static async getTotalsAll(userId: string): Promise<number> {
    const result = await UnreadCountQuery.getTotals(userId);
    return result.total;
  }

  static async getTotalsWithRevision(userId: string): Promise<{ total: number; userUnreadRevision: number }> {
    return UnreadCountQuery.getTotals(userId);
  }
}
