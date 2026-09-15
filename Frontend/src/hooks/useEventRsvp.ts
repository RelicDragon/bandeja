import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { eventViewerIntent, type EventViewerIntent } from '@/utils/eventDetails/eventParticipantLists';
import { useAuthStore } from '@/store/authStore';

export function useEventRsvp(game: Game | null, onUpdated: (game: Game) => void) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);
  const intent: EventViewerIntent = eventViewerIntent(game?.participants, user?.id);

  const run = useCallback(
    async (fn: () => Promise<Game>) => {
      if (!game || busy) return;
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void run(fn));
        return;
      }
      setBusy(true);
      try {
        const next = await fn();
        onUpdated(next);
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        const message = err.response?.data?.message || 'errors.generic';
        toast.error(t(message, { defaultValue: message }));
      } finally {
        setBusy(false);
      }
    },
    [busy, game, onUpdated, t],
  );

  const setGoing = useCallback(() => {
    if (!game || intent === 'going') return;
    void run(async () => {
      const res = await gamesApi.eventRsvp(game.id, 'going');
      return res.data;
    });
  }, [game, intent, run]);

  const setLooking = useCallback(
    (lookingNote?: string) => {
      if (!game || intent === 'looking') return;
      void run(async () => {
        const res = await gamesApi.eventRsvp(game.id, 'looking', lookingNote);
        return res.data;
      });
    },
    [game, intent, run],
  );

  const leave = useCallback(() => {
    if (!game || intent == null) return;
    void run(async () => {
      const res = await gamesApi.eventRsvpLeave(game.id);
      return res.data;
    });
  }, [game, intent, run]);

  const saveLookingNote = useCallback(
    (lookingNote: string | null) => {
      if (!game) return;
      void run(async () => {
        const res = await gamesApi.eventLookingNote(game.id, lookingNote);
        toast.success(t('eventDetails.noteSaved'));
        return res.data;
      });
    },
    [game, run, t],
  );

  return { intent, busy, setGoing, setLooking, leave, saveLookingNote };
}
