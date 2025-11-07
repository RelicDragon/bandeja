export type OpType = 'set' | 'add' | 'remove';

export interface Op {
  id: string;
  gameId: string;
  baseVersion: number;
  path: string;
  type: OpType;
  value?: any;
  ts: number;
  actor: { userId: string };
}

export type OpStatus = 'pending' | 'sending' | 'applied' | 'conflict' | 'failed';

export interface OutboxOp extends Op {
  status: OpStatus;
  retryCount?: number;
  lastError?: string;
}

export interface ConflictOp {
  opId: string;
  reason: string;
  serverPatch: Array<{ op: string; path: string; value: any }>;
  clientPatch: Array<{ op: string; path: string; value: any }>;
}

export interface BatchOpsResponse {
  applied: string[];
  headVersion: number;
  serverTime: string;
  conflicts: ConflictOp[];
}

export interface GameShadow {
  gameId: string;
  data: any;
  version: number;
  lastSyncedAt: number;
}

