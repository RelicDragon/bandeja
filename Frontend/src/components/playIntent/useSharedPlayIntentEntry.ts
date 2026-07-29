import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  playIntentsApi,
  type SharedPlayIntent,
} from '@/api/playIntents';
import { playIntentKeys } from '@/hooks/usePlayIntent';
import type { Sport } from '@/types';

export function useSharedPlayIntentEntry(enabled: boolean) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [intent, setIntent] = useState<SharedPlayIntent | null>(null);
  const [loadingShared, setLoadingShared] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinedSport, setJoinedSport] = useState<Sport | null>(null);
  const joiningRef = useRef(false);
  const automaticJoinRef = useRef<string | null>(null);
  const sharedId = searchParams.get('playIntent');
  const automaticJoinId = searchParams.get('joinPlayIntent');

  const replaceParams = useCallback(
    (configure: (next: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          configure(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const dismiss = useCallback(() => {
    setIntent(null);
    replaceParams((next) => next.delete('playIntent'));
  }, [replaceParams]);
  const clearJoinedSport = useCallback(() => setJoinedSport(null), []);

  const join = useCallback(
    async (intentId: string) => {
      if (joiningRef.current) return;
      joiningRef.current = true;
      setJoining(true);
      try {
        const joinedIntent = await playIntentsApi.joinShared(intentId);
        setJoinedSport(joinedIntent.sport);
        try {
          const freshPool = await playIntentsApi.getPool({
            cityId: joinedIntent.cityId,
            sport: joinedIntent.sport,
          });
          queryClient.setQueryData(
            playIntentKeys.pool(joinedIntent.cityId),
            freshPool,
          );
        } catch (error) {
          console.error('[PlayIntent] Failed to refresh joined lobby:', error);
        }
        void queryClient.invalidateQueries({ queryKey: playIntentKeys.all });
        setIntent(null);
        replaceParams((next) => {
          next.delete('playIntent');
          next.delete('joinPlayIntent');
          next.set('lobby', '1');
        });
      } catch (error: any) {
        automaticJoinRef.current = null;
        const key = error?.response?.data?.code || error?.response?.data?.message;
        toast.error(
          t(key || 'playIntent.sharedUnavailable', {
            defaultValue: t('playIntent.sharedUnavailable'),
          }),
        );
        replaceParams((next) => {
          next.delete('playIntent');
          next.delete('joinPlayIntent');
        });
      } finally {
        joiningRef.current = false;
        setJoining(false);
      }
    },
    [queryClient, replaceParams, t],
  );

  useEffect(() => {
    if (!enabled || !sharedId) {
      if (!sharedId) setIntent(null);
      setLoadingShared(false);
      return;
    }
    let cancelled = false;
    setIntent(null);
    setLoadingShared(true);
    void playIntentsApi
      .getShared(sharedId)
      .then((nextIntent) => {
        if (!cancelled) {
          setIntent(nextIntent);
          setLoadingShared(false);
        }
      })
      .catch((error: any) => {
        if (cancelled) return;
        const key = error?.response?.data?.code || error?.response?.data?.message;
        toast.error(
          t(key || 'playIntent.sharedUnavailable', {
            defaultValue: t('playIntent.sharedUnavailable'),
          }),
        );
        setLoadingShared(false);
        replaceParams((next) => next.delete('playIntent'));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, replaceParams, sharedId, t]);

  useEffect(() => {
    if (!automaticJoinId) {
      automaticJoinRef.current = null;
      return;
    }
    if (
      !enabled ||
      automaticJoinRef.current === automaticJoinId
    ) {
      return;
    }
    automaticJoinRef.current = automaticJoinId;
    void join(automaticJoinId);
  }, [automaticJoinId, enabled, join]);

  const progress: 'loading' | 'joining' | null =
    loadingShared ? 'loading' : joining && !intent ? 'joining' : null;

  return {
    intent,
    joining,
    progress,
    joinedSport,
    clearJoinedSport,
    dismiss,
    join: intent ? () => void join(intent.id) : undefined,
  };
}
