import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { userTeamsApi, type UserTeamInvitableGame } from '@/api/userTeams';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { toastApiError } from '@/utils/toastApiError';
import { addToGameToastKind } from './addToGameResult';
import { UserTeamInvitableGameRow } from './UserTeamInvitableGameRow';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  partnerName?: string | null;
};

export function AddUserTeamToGameSheet({ open, onOpenChange, teamId, partnerName }: Props) {
  const { t } = useTranslation();
  const [games, setGames] = useState<UserTeamInvitableGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  useBackButtonModal(open, () => onOpenChange(false), 'add-user-team-to-game');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const data = await userTeamsApi.getInvitableGames(teamId);
      setGames(data);
    } catch (e: unknown) {
      setLoadError(true);
      toastApiError(t, e);
    } finally {
      setLoading(false);
    }
  }, [teamId, t]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  const handleSelect = async (gameId: string) => {
    if (submittingId) return;
    setSubmittingId(gameId);
    try {
      const result = await userTeamsApi.addToGame(teamId, gameId);
      const kind = addToGameToastKind(result);
      const gameName = games.find((g) => g.id === gameId)?.name?.trim() || t('teams.team');
      if (kind === 'seated') {
        toast.success(t('teams.addToGameSuccessBothIn'));
      } else if (kind === 'invited') {
        toast.success(t('teams.addToGameSuccessInvited', { name: partnerName || t('teams.team') }));
      } else {
        toast.success(t('teams.addToGameSuccessAdded', { name: gameName }));
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toastApiError(t, e);
    } finally {
      setSubmittingId(null);
    }
  };

  const empty = !loading && !loadError && games.length === 0;
  const showInitialSpinner = loading && games.length === 0 && !loadError;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="max-h-[92dvh] overflow-hidden rounded-t-[32px] border-x border-t border-zinc-200/80 bg-zinc-50 text-zinc-950 shadow-[0_-24px_70px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b111b] dark:text-white"
        accessibleTitle={t('teams.addToGame')}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-white/20" aria-hidden />
        <DrawerCloseButton
          className="absolute right-4 top-3.5 z-20 bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/15"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-10">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">{t('teams.addToGame')}</h2>
            {loading && games.length > 0 ? (
              <Loader2 size={16} className="animate-spin text-primary-600 dark:text-primary-400" aria-hidden />
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            {t('teams.addToGameHint')}
          </p>

          {showInitialSpinner ? (
            <div className="flex justify-center py-12">
              <Loader2 size={22} className="animate-spin text-primary-600 dark:text-primary-400" />
            </div>
          ) : loadError && games.length === 0 ? (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-6 w-full rounded-2xl border border-zinc-200 bg-white py-3 text-sm font-semibold text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {t('common.retry', { defaultValue: 'Retry' })}
            </button>
          ) : empty ? (
            <p className="mt-8 text-center text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('teams.addToGameEmpty')}
            </p>
          ) : (
            <div className="mt-3.5 flex flex-col gap-2">
              {games.map((game) => (
                <UserTeamInvitableGameRow
                  key={game.id}
                  game={game}
                  disabled={submittingId !== null}
                  submitting={submittingId === game.id}
                  onSelect={(id) => void handleSelect(id)}
                />
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
