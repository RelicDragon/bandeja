import { resultsApi } from '@/api/results';
import { parseMatchLiveEnvelope } from '@/types/matchLiveScoring';
import { parseLiveScoringState, type LiveScoringState } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import type { SetResult } from '@/types/gameResults';

export type PersistLiveScoringParams = {
  gameId: string;
  matchId: string;
  nextState: LiveScoringState;
  baseRevision: number;
  opId: string;
  rules: ScoringRules | null;
  rawMatchSets: SetResult[] | undefined;
};

export type PersistLiveScoringResult =
  | { ok: true; state: LiveScoringState; revision: number }
  | { ok: false; conflict: true; state: LiveScoringState | null; revision: number | null; refresh: boolean }
  | { ok: false; conflict: false; message: string; refresh: boolean };

export async function persistLiveScoringPatch(
  params: PersistLiveScoringParams
): Promise<PersistLiveScoringResult> {
  const { gameId, matchId, nextState, baseRevision, opId, rules, rawMatchSets } = params;
  try {
    const res = await resultsApi.patchMatchLiveScoring(gameId, matchId, {
      state: nextState as unknown as Record<string, unknown>,
      baseRevision,
      clientMessageId:
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `m-${Date.now()}`,
      opId,
    });
    const env = res.data?.liveScoring;
    if (env) {
      if (!rules) {
        return { ok: false, conflict: false, message: 'Save failed', refresh: true };
      }
      return {
        ok: true,
        state: parseLiveScoringState(env.state, rules, rawMatchSets),
        revision: env.revision,
      };
    }
    return { ok: false, conflict: false, message: 'Save failed', refresh: true };
  } catch (err: unknown) {
    const ax = err as {
      response?: {
        status?: number;
        data?: { revision?: number; liveScoring?: unknown; message?: string };
      };
    };
    const rev409 = ax.response?.data?.revision;
    const bodyEnv = ax.response?.data?.liveScoring;
    if (ax.response?.status === 409 && typeof rev409 === 'number') {
      const parsed = parseMatchLiveEnvelope(bodyEnv);
      if (parsed) {
        if (!rules) {
          return { ok: false, conflict: true, state: null, revision: rev409, refresh: true };
        }
        return {
          ok: false,
          conflict: true,
          state: parseLiveScoringState(parsed.state, rules, rawMatchSets),
          revision: parsed.revision,
          refresh: false,
        };
      }
      return { ok: false, conflict: true, state: null, revision: rev409, refresh: true };
    }
    const msg =
      ax.response?.data && typeof ax.response.data.message === 'string'
        ? ax.response.data.message
        : 'Save failed';
    return { ok: false, conflict: false, message: msg, refresh: true };
  }
}
