import { keys, del } from 'idb-keyval';
import { ResultsStorage } from '@/services/resultsStorage';

const DB_PREFIX = 'padelpulse-results';
const GAMES_KEY = `${DB_PREFIX}:games`;

export const clearCachesExceptUnsyncedResults = async (): Promise<void> => {
  try {
    const allKeys = await keys();
    const gameResultKeys: string[] = [];
    const unsyncedGameIds: string[] = [];

    for (const key of allKeys) {
      if (typeof key === 'string' && key.startsWith(`${GAMES_KEY}:`)) {
        gameResultKeys.push(key);
        const gameId = key.replace(`${GAMES_KEY}:`, '');
        const results = await ResultsStorage.getResults(gameId);
        
        if (results && !results.lastSyncedAt) {
          unsyncedGameIds.push(gameId);
        }
      }
    }

    ResultsStorage.clearCache();

    for (const key of gameResultKeys) {
      const gameId = key.replace(`${GAMES_KEY}:`, '');
      if (!unsyncedGameIds.includes(gameId)) {
        await del(key);
      }
    }
    
    for (const gameId of unsyncedGameIds) {
      const results = await ResultsStorage.getResults(gameId);
      if (results) {
        await ResultsStorage.saveResults(results);
      }
    }
  } catch (error) {
    console.error('Failed to clear caches:', error);
  }
};

