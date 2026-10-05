import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { hasPendingNoviceCelebration } from '@shared/novice';
import { useAuthStore } from '@/store/authStore';
import { markNoviceMilestoneSeen } from '@/hooks/useNovice';
import {
  claimNoviceCelebration,
  markCelebrationShown,
  releaseNoviceCelebration,
  TROPHY_CELEBRATION_RELEASED,
} from '@/components/trophies/trophyCelebrationGate';
import { NoviceCelebrationSequence } from './NoviceCelebrationSequence';
import { loadNoviceCelebrationDetails } from './loadNoviceCelebrationDetails';
import { celebratedRankThisSession, recordCelebratedRank } from './noviceCelebrationSession';
import { buildNoviceCelebrationPlan, type NoviceCelebrationStep } from './noviceCelebrationPlan';

type Session = {
  userId: string;
  toRank: number;
  steps: NoviceCelebrationStep[];
  achievementIds: string[];
};

/**
 * PRD 358 — plays the blocking novice milestone sequence once per rank gained
 * (`noviceRank > noviceMilestoneSeenRank`, never for unlock-all users), then
 * acks the highest rank server-side so other devices skip it. Mounted once in
 * App; driven by the auth-store user (profile refresh on open / foreground,
 * `NOVICE_RANK_UP` push), never by the push alone.
 */
export function NoviceCelebrationHost() {
  const user = useAuthStore((s) => s.user);
  const isInitializing = useAuthStore((s) => s.isInitializing);
  const [session, setSession] = useState<Session | null>(null);
  const [gateTick, setGateTick] = useState(0);
  const startingRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  const userId = user?.id ?? null;
  const localSeen = userId ? celebratedRankThisSession(userId) : 0;
  const pending =
    !isInitializing &&
    !!user &&
    hasPendingNoviceCelebration(user) &&
    (user.noviceRank ?? 0) > localSeen;
  const fromRank = Math.max(user?.noviceMilestoneSeenRank ?? 0, localSeen);
  const toRank = user?.noviceRank ?? 0;
  const countedGames = user?.noviceCountedGames ?? null;
  // Read once when a sequence starts; a changed list must not restart the load.
  const pendingTrophiesRef = useRef(user?.trophies?.pendingCelebrations);
  pendingTrophiesRef.current = user?.trophies?.pendingCelebrations;

  // A trophy sheet that was already open finishes first; retry when it releases.
  useEffect(() => {
    const onRelease = () => setGateTick((n) => n + 1);
    window.addEventListener(TROPHY_CELEBRATION_RELEASED, onRelease);
    return () => window.removeEventListener(TROPHY_CELEBRATION_RELEASED, onRelease);
  }, []);

  useEffect(() => {
    if (!pending || !userId) {
      if (!sessionRef.current && !startingRef.current) releaseNoviceCelebration();
      return;
    }
    if (sessionRef.current || startingRef.current) return;
    if (!claimNoviceCelebration()) return;

    startingRef.current = true;
    let cancelled = false;
    void loadNoviceCelebrationDetails(userId, pendingTrophiesRef.current).then((details) => {
      if (cancelled) return;
      startingRef.current = false;
      const steps = buildNoviceCelebrationPlan({
        fromRank,
        toRank,
        countedGames,
        result: details.result,
        achievements: details.achievements,
      });
      if (steps.length === 0) {
        releaseNoviceCelebration();
        return;
      }
      setSession({
        userId,
        toRank,
        steps,
        achievementIds: details.achievements
          .map((a) => a.achievementId)
          .filter((id): id is string => Boolean(id)),
      });
    });
    return () => {
      cancelled = true;
      startingRef.current = false;
    };
  }, [pending, userId, fromRank, toRank, countedGames, gateTick]);

  // Signed out / switched account mid-sequence: drop it, nothing is acked.
  useEffect(() => {
    if (session && session.userId !== userId) {
      setSession(null);
      releaseNoviceCelebration();
    }
  }, [session, userId]);

  useEffect(() => () => releaseNoviceCelebration(), []);

  const handleFinish = useCallback(() => {
    const done = sessionRef.current;
    if (!done) return;
    recordCelebratedRank(done.userId, done.toRank);
    for (const id of done.achievementIds) markCelebrationShown(id);
    setSession(null);
    markNoviceMilestoneSeen(done.toRank).catch(() => {
      // Server keeps the old seen-rank → the next launch replays and re-acks.
    });
  }, []);

  return (
    <AnimatePresence onExitComplete={releaseNoviceCelebration}>
      {session && (
        <NoviceCelebrationSequence
          key={`${session.userId}:${session.toRank}`}
          steps={session.steps}
          onFinish={handleFinish}
        />
      )}
    </AnimatePresence>
  );
}
