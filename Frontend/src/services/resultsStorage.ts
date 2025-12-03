import { get, set, del } from 'idb-keyval';
import { Round } from '@/types/gameResults';

const DB_PREFIX = 'padelpulse-results';
const GAMES_KEY = `${DB_PREFIX}:games`;
const SERVER_PROBLEM_KEY = `${DB_PREFIX}:server-problem`;

export interface LocalResults {
  gameId: string;
  rounds: Round[];
  lastSyncedAt?: number;
}

export class ResultsStorage {
  private static gamesCache = new Map<string, LocalResults>();

  static async getResults(gameId: string): Promise<LocalResults | null> {
    if (this.gamesCache.has(gameId)) {
      return this.gamesCache.get(gameId)!;
    }
    const key = `${GAMES_KEY}:${gameId}`;
    const results = await get<LocalResults>(key);
    if (results) {
      this.gamesCache.set(gameId, results);
    }
    return results || null;
  }

  static async saveResults(results: LocalResults): Promise<void> {
    const key = `${GAMES_KEY}:${results.gameId}`;
    await set(key, results);
    this.gamesCache.set(results.gameId, results);
  }

  static async deleteResults(gameId: string): Promise<void> {
    const key = `${GAMES_KEY}:${gameId}`;
    await del(key);
    this.gamesCache.delete(gameId);
  }

  static async getServerProblem(gameId: string): Promise<boolean> {
    const key = `${SERVER_PROBLEM_KEY}:${gameId}`;
    const value = await get<boolean>(key);
    return value || false;
  }

  static async setServerProblem(gameId: string, hasProblem: boolean): Promise<void> {
    const key = `${SERVER_PROBLEM_KEY}:${gameId}`;
    if (hasProblem) {
      await set(key, true);
    } else {
      await del(key);
    }
  }
}
