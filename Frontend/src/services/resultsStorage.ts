import { get, set, del, keys } from 'idb-keyval';
import { OutboxOp, GameShadow, ConflictOp } from '@/types/ops';

const DB_PREFIX = 'padelpulse-results';
const GAMES_KEY = `${DB_PREFIX}:games`;
const OUTBOX_KEY = `${DB_PREFIX}:outbox`;
const CONFLICTS_KEY = `${DB_PREFIX}:conflicts`;

export class ResultsStorage {
  private static gamesCache = new Map<string, GameShadow>();
  private static outboxCache = new Map<string, OutboxOp[]>();

  static async getGame(gameId: string): Promise<GameShadow | null> {
    if (this.gamesCache.has(gameId)) {
      return this.gamesCache.get(gameId)!;
    }
    const key = `${GAMES_KEY}:${gameId}`;
    const game = await get<GameShadow>(key);
    if (game) {
      this.gamesCache.set(gameId, game);
    }
    return game || null;
  }

  static async saveGame(game: GameShadow): Promise<void> {
    const key = `${GAMES_KEY}:${game.gameId}`;
    await set(key, game);
    this.gamesCache.set(game.gameId, game);
  }

  static async deleteGame(gameId: string): Promise<void> {
    const key = `${GAMES_KEY}:${gameId}`;
    await del(key);
    this.gamesCache.delete(gameId);
  }

  static async getAllGames(): Promise<GameShadow[]> {
    const allKeys = await keys();
    const gameKeys = allKeys.filter((k) => 
      typeof k === 'string' && k.startsWith(`${GAMES_KEY}:`)
    ) as string[];
    
    const games = await Promise.all(
      gameKeys.map((key) => get<GameShadow>(key))
    );
    
    return games.filter((g): g is GameShadow => g !== undefined);
  }

  static async getOutbox(gameId: string): Promise<OutboxOp[]> {
    const cacheKey = `${gameId}`;
    if (this.outboxCache.has(cacheKey)) {
      return this.outboxCache.get(cacheKey)!;
    }
    const key = `${OUTBOX_KEY}:${gameId}`;
    const ops = await get<OutboxOp[]>(key);
    const result = ops || [];
    this.outboxCache.set(cacheKey, result);
    return result;
  }

  static async addToOutbox(gameId: string, op: OutboxOp): Promise<void> {
    const ops = await this.getOutbox(gameId);
    ops.push(op);
    await this.saveOutbox(gameId, ops);
  }

  static async saveOutbox(gameId: string, ops: OutboxOp[]): Promise<void> {
    const key = `${OUTBOX_KEY}:${gameId}`;
    await set(key, ops);
    this.outboxCache.set(`${gameId}`, ops);
  }

  static async updateOutboxOp(gameId: string, opId: string, updates: Partial<OutboxOp>): Promise<void> {
    const ops = await this.getOutbox(gameId);
    const index = ops.findIndex((o) => o.id === opId);
    if (index !== -1) {
      ops[index] = { ...ops[index], ...updates };
      await this.saveOutbox(gameId, ops);
    }
  }

  static async removeOutboxOps(gameId: string, opIds: string[]): Promise<void> {
    const ops = await this.getOutbox(gameId);
    const filtered = ops.filter((o) => !opIds.includes(o.id));
    await this.saveOutbox(gameId, filtered);
  }

  static async getAllOutboxes(): Promise<Map<string, OutboxOp[]>> {
    const allKeys = await keys();
    const outboxKeys = allKeys.filter((k) => 
      typeof k === 'string' && k.startsWith(`${OUTBOX_KEY}:`)
    ) as string[];
    
    const map = new Map<string, OutboxOp[]>();
    for (const key of outboxKeys) {
      const gameId = key.replace(`${OUTBOX_KEY}:`, '');
      const ops = await get<OutboxOp[]>(key);
      if (ops) {
        map.set(gameId, ops);
      }
    }
    
    return map;
  }

  static async getConflicts(gameId: string): Promise<ConflictOp[]> {
    const key = `${CONFLICTS_KEY}:${gameId}`;
    return (await get<ConflictOp[]>(key)) || [];
  }

  static async saveConflicts(gameId: string, conflicts: ConflictOp[]): Promise<void> {
    const key = `${CONFLICTS_KEY}:${gameId}`;
    await set(key, conflicts);
  }

  static async clearConflicts(gameId: string): Promise<void> {
    const key = `${CONFLICTS_KEY}:${gameId}`;
    await del(key);
  }

  static async clearOutbox(gameId: string): Promise<void> {
    const key = `${OUTBOX_KEY}:${gameId}`;
    await del(key);
    this.outboxCache.delete(`${gameId}`);
  }

  static async clearAll(): Promise<void> {
    const allKeys = await keys();
    const toDelete = allKeys.filter((k) => 
      typeof k === 'string' && k.startsWith(DB_PREFIX)
    ) as string[];
    
    await Promise.all(toDelete.map((key) => del(key)));
    this.gamesCache.clear();
    this.outboxCache.clear();
  }
}

