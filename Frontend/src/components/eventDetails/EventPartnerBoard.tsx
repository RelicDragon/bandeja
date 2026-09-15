import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Button, Input, PlayerAvatar } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { usePlayersStore } from '@/store/playersStore';
import { parseGameSport } from '@/utils/gameSport';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import { eventLookingParticipants } from '@/utils/eventDetails/eventParticipantLists';
import type { Game } from '@/types';

type EventPartnerBoardProps = {
  game: Game;
  isLooking: boolean;
  onSaveNote: (note: string | null) => void;
};

export function EventPartnerBoard({ game, isLooking, onSaveNote }: EventPartnerBoardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const sport = parseGameSport(game.sport);
  const rows = eventLookingParticipants(game.participants);
  const mine = rows.find((p) => p.userId === user?.id);
  const [note, setNote] = useState(mine?.lookingNote ?? '');
  const [messagingId, setMessagingId] = useState<string | null>(null);

  useEffect(() => {
    setNote(mine?.lookingNote ?? '');
  }, [mine?.lookingNote, isLooking]);

  const openDm = async (userId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (messagingId) return;
    setMessagingId(userId);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(userId);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      navigate(`/user-chat/${chat.id}`, { state: { chat, contextType: 'USER' } });
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setMessagingId(null);
    }
  };

  return (
    <section className="space-y-3 px-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {t('eventDetails.partnerBoardTitle')}
      </h2>
      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-violet-300/80 bg-violet-50/60 px-4 py-5 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
          {t('eventDetails.partnerBoardEmpty')}
        </p>
      )}
      <ul className="space-y-2">
        {rows.map((row) => {
          const level = getDisplayLevelForSport(row.user, sport).toFixed(1);
          const name = [row.user.firstName, row.user.lastName].filter(Boolean).join(' ').trim();
          const isSelf = row.userId === user?.id;
          return (
            <li
              key={row.userId}
              className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"
            >
              <PlayerAvatar player={row.user} extrasmall showName={false} fullHideName levelSport={sport} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{name || '—'}</p>
                <p className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{level}</p>
                {row.lookingNote?.trim() && (
                  <p className="mt-0.5 truncate text-xs text-gray-600 dark:text-gray-300">{row.lookingNote}</p>
                )}
              </div>
              {!isSelf && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={messagingId === row.userId}
                  onClick={() => void openDm(row.userId)}
                >
                  {t('eventDetails.message')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {isLooking && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('eventDetails.lookingNotePlaceholder')}
              maxLength={280}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="primary"
            className="shrink-0"
            onClick={() => onSaveNote(note.trim() || null)}
          >
            {t('eventDetails.saveNote')}
          </Button>
        </div>
      )}
    </section>
  );
}
