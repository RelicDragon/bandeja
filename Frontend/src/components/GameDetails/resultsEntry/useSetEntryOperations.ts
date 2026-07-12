import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Round } from '@/types/gameResults';
import { GameResultsEngine } from '@/services/gameResultsEngine';
import { validateSetIndex } from '@/utils/gameResults';
import {
  getRules,
  isLegalSetScore,
  validationMessage,
  shouldAppendSetAfterUpdate,
  trimTrailingEmptyAfterDecision,
  getStandingsMatchOutcome,
  isClassicRules,
  isClassicAutomaticRelaxedScores,
  automaticSetEntryUsesTieBreak,
  mergeAutomaticMatchRecordMetadata,
  type AutomaticMatchRecordMode,
} from '@/utils/scoring';
import { isSupplementalMatchSet, type MatchSetRole } from '@/utils/matchSetRole';

type SupplementalRole = Extract<MatchSetRole, 'EXTRA_GAMES' | 'EXTRA_BALLS'>;

interface UseSetEntryOperationsParams {
  rounds: Round[];
  updateMatch: (
    roundId: string,
    matchId: string,
    match: {
      teamA: string[];
      teamB: string[];
      sets: Array<{ teamA: number; teamB: number; isTieBreak?: boolean; role?: MatchSetRole }>;
      courtId?: string;
      metadata?: Record<string, unknown>;
    }
  ) => Promise<unknown>;
  onSupplementalSetAdded: (roundId: string, matchId: string, setIndex: number) => void;
}

export function useSetEntryOperations({
  rounds,
  updateMatch,
  onSupplementalSetAdded,
}: UseSetEntryOperationsParams) {
  const { t } = useTranslation();

  const updateSetResult = useCallback(
    async (
      roundId: string,
      matchId: string,
      setIndex: number,
      teamAScore: number,
      teamBScore: number,
      isTieBreak?: boolean,
      supplementalRole?: SupplementalRole,
      options?: { automaticRecordMode?: AutomaticMatchRecordMode }
    ) => {
      const setIndexError = validateSetIndex(setIndex);
      if (setIndexError) {
        console.error(setIndexError, setIndex);
        toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
        return;
      }

      const rules = getRules(GameResultsEngine.getState().game);

      try {
        const round = rounds.find((r) => r.id === roundId);
        if (!round) {
          toast.error(t('errors.roundNotFound') || 'Round not found');
          return;
        }

        const match = round.matches.find((m) => m.id === matchId);
        if (!match) {
          toast.error(t('errors.matchNotFound') || 'Match not found');
          return;
        }

        const existingAt = match.sets[setIndex];
        if (supplementalRole || (existingAt && isSupplementalMatchSet(existingAt))) {
          const role = supplementalRole ?? existingAt?.role ?? 'EXTRA_GAMES';
          const workingSets = [...match.sets];
          workingSets[setIndex] = {
            ...workingSets[setIndex],
            teamA: teamAScore,
            teamB: teamBScore,
            isTieBreak: false,
            role,
          };
          await updateMatch(roundId, matchId, {
            teamA: match.teamA,
            teamB: match.teamB,
            sets: workingSets,
            courtId: match.courtId,
          });
          return;
        }

        const workingSets = [...match.sets];
        const cap = rules.fixedNumberOfSets > 0 ? rules.fixedNumberOfSets : 99;
        while (workingSets.length <= setIndex && workingSets.length < cap) {
          workingSets.push({ teamA: 0, teamB: 0, isTieBreak: false, role: 'OFFICIAL' });
        }
        if (setIndex >= workingSets.length) {
          toast.error(
            t('errors.setIndexExceedsMax', { max: workingSets.length - 1 }) || 'Invalid set index'
          );
          return;
        }

        const validation = isLegalSetScore(teamAScore, teamBScore, rules, setIndex, workingSets, isTieBreak);
        if (!validation.ok && validation.reason && !isClassicAutomaticRelaxedScores(rules)) {
          toast.error(validationMessage(t, validation.reason, validation.detail));
          return;
        }

        const kind = isClassicAutomaticRelaxedScores(rules)
          ? automaticSetEntryUsesTieBreak(setIndex, workingSets, rules, Boolean(isTieBreak))
            ? 'SUPER_TIEBREAK'
            : 'REGULAR'
          : validation.kind;
        const finalIsTieBreak = kind === 'TIEBREAK_GAME' || kind === 'SUPER_TIEBREAK';

        workingSets[setIndex] = {
          ...workingSets[setIndex],
          teamA: teamAScore,
          teamB: teamBScore,
          isTieBreak: finalIsTieBreak,
          role: workingSets[setIndex].role ?? 'OFFICIAL',
        };

        const metadata =
          options?.automaticRecordMode != null
            ? mergeAutomaticMatchRecordMetadata(match.metadata, options.automaticRecordMode)
            : match.metadata;

        if (isClassicRules(rules) && rules.superTieBreakReplacesDeciderAtIndex === null) {
          for (let i = 0; i < workingSets.length; i++) {
            if (i !== setIndex && workingSets[i].isTieBreak) {
              workingSets[i] = { ...workingSets[i], isTieBreak: false };
            }
          }
        }

        let nextSets = workingSets;
        const appended = shouldAppendSetAfterUpdate(workingSets, rules);
        if (appended) {
          nextSets = [...workingSets, appended];
        }

        const outcome = getStandingsMatchOutcome(nextSets, rules);
        if (outcome !== null) {
          nextSets = trimTrailingEmptyAfterDecision(nextSets, rules);
        }

        await updateMatch(roundId, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: nextSets,
          courtId: match.courtId,
          metadata,
        });
      } catch (error: unknown) {
        console.error('Failed to update set result:', error);
        const err = error as { response?: { data?: { message?: string } } };
        toast.error(
          err?.response?.data?.message || t('errors.generic') || 'Failed to update set result'
        );
      }
    },
    [rounds, updateMatch, t]
  );

  const addSupplementalSet = useCallback(
    async (roundId: string, matchId: string) => {
      const round = rounds.find((r) => r.id === roundId);
      const match = round?.matches.find((m) => m.id === matchId);
      if (!round || !match) return;
      const next = [
        ...match.sets,
        { teamA: 0, teamB: 0, isTieBreak: false, role: 'EXTRA_GAMES' as const },
      ];
      try {
        await updateMatch(roundId, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: next,
          courtId: match.courtId,
        });
        onSupplementalSetAdded(roundId, matchId, next.length - 1);
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        toast.error(err?.response?.data?.message || t('errors.generic'));
      }
    },
    [rounds, updateMatch, onSupplementalSetAdded, t]
  );

  const removeSet = useCallback(
    async (roundId: string, matchId: string, setIndex: number) => {
      const setIndexError = validateSetIndex(setIndex);
      if (setIndexError) {
        console.error(setIndexError, setIndex);
        toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
        return;
      }

      try {
        const round = rounds.find((r) => r.id === roundId);
        if (!round) {
          toast.error(t('errors.roundNotFound') || 'Round not found');
          return;
        }

        const match = round.matches.find((m) => m.id === matchId);
        if (!match) {
          toast.error(t('errors.matchNotFound') || 'Match not found');
          return;
        }

        const rules = getRules(GameResultsEngine.getState().game);
        const removingSupplemental = isSupplementalMatchSet(match.sets[setIndex]);
        if (rules.fixedNumberOfSets > 0 && !rules.allowRemoveSet && !removingSupplemental) {
          toast.error(
            t('errors.cannotRemoveLastSet') || 'Cannot remove sets when fixed number of sets is set'
          );
          return;
        }

        if (match.sets.length <= 1) {
          toast.error(t('errors.cannotRemoveLastSet') || 'Cannot remove the last set');
          return;
        }

        if (setIndex >= match.sets.length) {
          toast.error(t('errors.invalidSetIndex') || 'Invalid set index');
          return;
        }

        const newSets = [...match.sets];
        newSets.splice(setIndex, 1);

        await updateMatch(roundId, matchId, {
          teamA: match.teamA,
          teamB: match.teamB,
          sets: newSets,
          courtId: match.courtId,
        });
      } catch (error: unknown) {
        console.error('Failed to remove set:', error);
        const err = error as { response?: { data?: { message?: string } } };
        toast.error(
          err?.response?.data?.message || t('errors.generic') || 'Failed to remove set'
        );
      }
    },
    [rounds, updateMatch, t]
  );

  return { updateSetResult, addSupplementalSet, removeSet };
}
