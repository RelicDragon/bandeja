import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ToggleSwitch } from '@/components';
import { gamesApi } from '@/api/games';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { getGameParticipationState } from '@/utils/gameParticipationState';

type GameResultsShowInStoriesSwitchProps = {
  /** Prefer shell game so participant.showInStories survives results-engine merges. */
  game: Game;
  onGameUpdate: (game: Game) => void;
};

function userPlayedGame(game: Game, userId: string | undefined): boolean {
  if (!userId) return false;
  const { isPlaying } = getGameParticipationState(game.participants ?? [], userId, game);
  if (isPlaying) return true;
  return (game.outcomes ?? []).some((o) => o.userId === userId);
}

export function GameResultsShowInStoriesSwitch({
  game,
  onGameUpdate,
}: GameResultsShowInStoriesSwitchProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const requestIdRef = useRef(0);
  const gameRef = useRef(game);
  gameRef.current = game;

  const canToggle = userPlayedGame(game, userId);
  const participant = (game.participants ?? []).find((p) => p.userId === userId);
  const serverChecked = participant?.showInStories !== false;
  const [checked, setChecked] = useState(serverChecked);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (saving) return;
    setChecked(serverChecked);
  }, [serverChecked, saving]);

  if (!userId || !canToggle || !participant) return null;

  const entityLabel = t(`games.entityTypes.${game.entityType}`, {
    defaultValue: t('games.entityTypes.GAME'),
  }).toLowerCase();

  const patchShowInStories = (base: Game, value: boolean): Game => ({
    ...base,
    participants: (base.participants ?? []).map((p) =>
      p.userId === userId ? { ...p, showInStories: value } : p
    ),
  });

  const handleChange = async (next: boolean) => {
    if (saving || next === checked) return;
    const requestId = ++requestIdRef.current;
    const snapshot = gameRef.current;
    const previousChecked = checked;
    setChecked(next);
    setSaving(true);
    onGameUpdate(patchShowInStories(snapshot, next));
    try {
      const res = await gamesApi.setMyShowInStories(snapshot.id, next);
      if (requestId !== requestIdRef.current) return;
      const confirmed = res.data?.showInStories ?? next;
      setChecked(confirmed);
      onGameUpdate(patchShowInStories(gameRef.current, confirmed));
    } catch {
      if (requestId !== requestIdRef.current) return;
      setChecked(previousChecked);
      onGameUpdate(patchShowInStories(gameRef.current, previousChecked));
      toast.error(t('gameResults.showInStoriesFailed'));
    } finally {
      if (requestId === requestIdRef.current) {
        setSaving(false);
      }
    }
  };

  const switchId = `show-in-stories-${game.id}`;

  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white/60 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40">
      <label
        htmlFor={switchId}
        className="min-w-0 flex-1 cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-200"
      >
        {t('gameResults.showInStories', { entity: entityLabel })}
      </label>
      <ToggleSwitch
        id={switchId}
        checked={checked}
        onChange={(v) => void handleChange(v)}
        disabled={saving}
      />
    </div>
  );
}
