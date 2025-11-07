import { nanoid } from 'nanoid';
import { ResultsStorage } from './resultsStorage';
import { resultsApi } from '@/api/results';

const SYNC_INTERVAL = 5000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000;
const DEBOUNCE_SYNC_DELAY = 2000;

export class ResultsSyncService {
  private syncInterval: number | null = null;
  private syncInProgress = false;
  private listeners = new Set<() => void>();
  private activeSyncs = new Map<string, boolean>();
  private retryTimeouts = new Map<string, number>();
  private debouncedSyncTimeouts = new Map<string, number>();

  private exponentialBackoff(retryCount: number): number {
    const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }

  private async syncGame(gameId: string): Promise<void> {
    if (this.activeSyncs.get(gameId)) {
      return;
    }

    this.activeSyncs.set(gameId, true);

    try {
      const ops = await ResultsStorage.getOutbox(gameId);
      const pendingOps = ops.filter((o) => o.status === 'pending' || o.status === 'failed');
      
      if (pendingOps.length === 0) return;

      const game = await ResultsStorage.getGame(gameId);
      if (!game) return;

      const batchId = nanoid();
      const batchOps = pendingOps.map((op) => ({
        id: op.id,
        base_version: op.baseVersion,
        op: (op.type === 'set' ? 'replace' : op.type) as 'replace' | 'add' | 'remove',
        path: op.path,
        value: op.value,
        actor: op.actor,
      }));

      for (const op of pendingOps) {
        await ResultsStorage.updateOutboxOp(gameId, op.id, { status: 'sending' });
      }

      try {
        const response = await resultsApi.batchOps(gameId, batchId, { ops: batchOps });
        const result = response.data;

        if (result.applied.length > 0) {
          await ResultsStorage.removeOutboxOps(gameId, result.applied);
          
          const updatedGame = await ResultsStorage.getGame(gameId);
          if (updatedGame) {
            updatedGame.version = result.headVersion;
            updatedGame.lastSyncedAt = Date.now();
            await ResultsStorage.saveGame(updatedGame);
          }
        }

        if (result.conflicts.length > 0) {
          await ResultsStorage.saveConflicts(gameId, result.conflicts);
          
          for (const conflict of result.conflicts) {
            await ResultsStorage.updateOutboxOp(gameId, conflict.opId, { 
              status: 'conflict',
              lastError: conflict.reason,
            });
          }
        }

        for (const op of pendingOps) {
          if (result.applied.includes(op.id)) {
            await ResultsStorage.updateOutboxOp(gameId, op.id, { status: 'applied' });
          } else if (!result.conflicts.some((c) => c.opId === op.id)) {
            await ResultsStorage.updateOutboxOp(gameId, op.id, { status: 'failed', lastError: 'Not applied' });
          }
        }
      } catch (error: any) {
        const status = error?.response?.status;
        
        if (status === 401 || status === 403) {
          for (const op of pendingOps) {
            await ResultsStorage.updateOutboxOp(gameId, op.id, { 
              status: 'failed',
              lastError: 'Authentication required',
            });
          }
          return;
        }

        if (status === 409) {
          for (const op of pendingOps) {
            await ResultsStorage.updateOutboxOp(gameId, op.id, { 
              status: 'conflict',
              lastError: 'Version conflict',
            });
          }
          return;
        }

        if (status === 429) {
          for (const op of pendingOps) {
            await ResultsStorage.updateOutboxOp(gameId, op.id, { status: 'pending' });
          }
          this.scheduleRetry(gameId, 0);
          return;
        }

        if (status >= 500 || !status) {
          const maxRetryCount = Math.max(...pendingOps.map(o => o.retryCount || 0));
          const newRetryCount = maxRetryCount + 1;
          
          if (newRetryCount < MAX_RETRIES) {
            for (const op of pendingOps) {
              await ResultsStorage.updateOutboxOp(gameId, op.id, {
                status: 'pending',
                retryCount: newRetryCount,
                lastError: error?.message || 'Server error',
              });
            }
            this.scheduleRetry(gameId, newRetryCount);
          } else {
            for (const op of pendingOps) {
              await ResultsStorage.updateOutboxOp(gameId, op.id, {
                status: 'failed',
                retryCount: newRetryCount,
                lastError: 'Max retries exceeded',
              });
            }
          }
          return;
        }

        for (const op of pendingOps) {
          await ResultsStorage.updateOutboxOp(gameId, op.id, {
            status: 'failed',
            lastError: error?.message || 'Sync failed',
          });
        }
      }
    } finally {
      this.activeSyncs.delete(gameId);
    }
  }

  private scheduleRetry(gameId: string, retryCount: number): void {
    const existingTimeout = this.retryTimeouts.get(gameId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const delay = this.exponentialBackoff(retryCount);
    const timeoutId = window.setTimeout(() => {
      this.retryTimeouts.delete(gameId);
      this.syncGame(gameId);
    }, delay);
    
    this.retryTimeouts.set(gameId, timeoutId);
  }

  private async syncAll(): Promise<void> {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    try {
      const outboxes = await ResultsStorage.getAllOutboxes();
      const gameIds = Array.from(outboxes.keys());
      
      for (const gameId of gameIds) {
        if (!this.activeSyncs.get(gameId)) {
          await this.syncGame(gameId);
        }
      }
      
      this.notifyListeners();
    } finally {
      this.syncInProgress = false;
    }
  }

  start(): void {
    if (this.syncInterval !== null) return;

    this.syncAll();

    if ('serviceWorker' in navigator && navigator.serviceWorker) {
      navigator.serviceWorker.ready.then((registration) => {
        if (registration && 'sync' in registration) {
          (registration as any).sync.register('results-sync').catch(() => {
            this.startFallbackSync();
          });
        } else {
          this.startFallbackSync();
        }
      }).catch(() => {
        this.startFallbackSync();
      });
    } else {
      this.startFallbackSync();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.syncAll());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.syncAll();
        }
      });
    }
  }

  private startFallbackSync(): void {
    this.syncInterval = window.setInterval(() => {
      const outboxes = ResultsStorage.getAllOutboxes();
      outboxes.then((boxes) => {
        const hasPending = Array.from(boxes.values()).some((ops) =>
          ops.some((op) => op.status === 'pending' || op.status === 'failed')
        );
        if (hasPending) {
          this.syncAll();
        }
      });
    }, SYNC_INTERVAL);
  }

  stop(): void {
    if (this.syncInterval !== null) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    
    for (const timeoutId of this.retryTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.retryTimeouts.clear();
    
    for (const timeoutId of this.debouncedSyncTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.debouncedSyncTimeouts.clear();
    
    this.activeSyncs.clear();
  }

  onSync(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((callback) => callback());
  }

  async forceSync(gameId: string): Promise<void> {
    if (!this.activeSyncs.get(gameId)) {
      await this.syncGame(gameId);
      this.notifyListeners();
    }
  }

  debouncedSync(gameId: string): void {
    const existingTimeout = this.debouncedSyncTimeouts.get(gameId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutId = window.setTimeout(() => {
      this.debouncedSyncTimeouts.delete(gameId);
      this.forceSync(gameId).catch((error) => {
        console.error('Failed to sync:', error);
      });
    }, DEBOUNCE_SYNC_DELAY);

    this.debouncedSyncTimeouts.set(gameId, timeoutId);
  }
}

export const resultsSyncService = new ResultsSyncService();

