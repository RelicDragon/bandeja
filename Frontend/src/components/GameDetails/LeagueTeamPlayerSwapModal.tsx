import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Check, Loader2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { PlayerAvatar } from '@/components';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { leaguesApi, LeagueStanding } from '@/api/leagues';
import type { BasicUser } from '@/types';
import { matchesSearch } from '@/utils/transliteration';

function playerDisplayName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

type Step = 'out' | 'in' | 'confirm';

interface LeagueTeamPlayerSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueSeasonId: string;
  participant: LeagueStanding;
  onSwapped: () => void;
}

export function LeagueTeamPlayerSwapModal({
  isOpen,
  onClose,
  leagueSeasonId,
  participant,
  onSwapped,
}: LeagueTeamPlayerSwapModalProps) {
  const { t } = useTranslation();
  const teamPlayers = useMemo(
    () => participant.leagueTeam?.players.filter((p) => p.user) ?? [],
    [participant.leagueTeam?.players],
  );

  const [step, setStep] = useState<Step>('out');
  const [outUserId, setOutUserId] = useState<string | null>(null);
  const [inUser, setInUser] = useState<BasicUser | null>(null);
  const [candidates, setCandidates] = useState<BasicUser[]>([]);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const reset = useCallback(() => {
    setStep('out');
    setOutUserId(null);
    setInUser(null);
    setCandidates([]);
    setSearchQuery('');
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      reset();
    }
  }, [isOpen, reset]);

  const outPlayer = teamPlayers.find((p) => p.userId === outUserId)?.user ?? null;
  const stayingPlayer = teamPlayers.find((p) => p.userId !== outUserId)?.user ?? null;

  const loadCandidates = useCallback(
    async (selectedOutUserId: string) => {
      setLoadingCandidates(true);
      try {
        const res = await leaguesApi.listTeamSwapCandidates(
          leagueSeasonId,
          participant.id,
          selectedOutUserId,
        );
        setCandidates(res.data.candidates);
        setAllowMultiple(res.data.allowUserInMultipleTeams);
      } catch (error: unknown) {
        const err = error as { response?: { data?: { message?: string } } };
        const errorMessage = err.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
        setCandidates([]);
      } finally {
        setLoadingCandidates(false);
      }
    },
    [leagueSeasonId, participant.id, t],
  );

  const handleSelectOut = async (userId: string) => {
    setOutUserId(userId);
    setInUser(null);
    setSearchQuery('');
    setStep('in');
    await loadCandidates(userId);
  };

  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    return candidates.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`;
      return matchesSearch(searchQuery, fullName);
    });
  }, [candidates, searchQuery]);

  const handleConfirm = async () => {
    if (!outUserId || !inUser || submitting) return;
    setSubmitting(true);
    try {
      await leaguesApi.swapTeamPlayer(leagueSeasonId, participant.id, {
        outUserId,
        inUserId: inUser.id,
      });
      toast.success(t('gameDetails.swapPlayerSuccess'));
      onSwapped();
      onClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitle =
    step === 'out'
      ? t('gameDetails.swapPlayerSelectOut')
      : step === 'in'
        ? t('gameDetails.swapPlayerSelectIn')
        : t('gameDetails.swapPlayerConfirmTitle');

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="league-team-player-swap">
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-primary-600 dark:text-primary-400" />
            {t('gameDetails.swapPlayerTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{stepTitle}</p>

          {step === 'out' && (
            <div className="space-y-2">
              {teamPlayers.map((tp) => (
                <button
                  key={tp.userId}
                  type="button"
                  onClick={() => void handleSelectOut(tp.userId)}
                  className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-2.5 text-left transition hover:border-primary-300 hover:bg-primary-50/60 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-primary-600 dark:hover:bg-primary-900/20"
                >
                  <PlayerAvatar player={tp.user} showName={false} fullHideName extrasmall />
                  <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white">
                    {playerDisplayName(tp.user)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 'in' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <span className="font-medium">{t('gameDetails.swapPlayerReplacing')}:</span>
                <span>{outPlayer ? playerDisplayName(outPlayer) : '—'}</span>
              </div>

              {!allowMultiple ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('gameDetails.swapPlayerSingleTeamHint')}
                </p>
              ) : (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('gameDetails.swapPlayerMultiTeamHint')}
                </p>
              )}

              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search')}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              {loadingCandidates ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-gray-400" size={22} />
                </div>
              ) : filteredCandidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                  {t('gameDetails.swapPlayerNoCandidates')}
                </p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto">
                  {filteredCandidates.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setInUser(user);
                        setStep('confirm');
                      }}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition hover:border-gray-200 hover:bg-gray-50 dark:hover:border-gray-700 dark:hover:bg-gray-800/60"
                    >
                      <PlayerAvatar player={user} showName={false} fullHideName extrasmall />
                      <span className="min-w-0 flex-1 text-sm font-medium text-gray-900 dark:text-white">
                        {playerDisplayName(user)}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setStep('out');
                  setOutUserId(null);
                  setInUser(null);
                }}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {t('common.back')}
              </button>
            </div>
          )}

          {step === 'confirm' && outPlayer && inUser && (
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-3 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="flex items-center gap-3">
                  <PlayerAvatar player={outPlayer} showName={false} fullHideName extrasmall />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {t('gameDetails.swapPlayerOut')}
                    </p>
                    <p className="text-sm font-medium text-gray-900 line-through dark:text-white">
                      {playerDisplayName(outPlayer)}
                    </p>
                  </div>
                  <ArrowLeftRight size={16} className="shrink-0 text-primary-500" />
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">
                      {t('gameDetails.swapPlayerIn')}
                    </p>
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      {playerDisplayName(inUser)}
                    </p>
                  </div>
                  <PlayerAvatar player={inUser} showName={false} fullHideName extrasmall />
                </div>
                {stayingPlayer ? (
                  <p className="mt-3 border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    {t('gameDetails.swapPlayerStayingWith', {
                      name: playerDisplayName(stayingPlayer),
                    })}
                  </p>
                ) : null}
              </div>

              <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                <li className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  {t('gameDetails.swapPlayerKeepStats')}
                </li>
                <li className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  {t('gameDetails.swapPlayerPastRatingsSafe')}
                </li>
                <li className="flex gap-2">
                  <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                  {t('gameDetails.swapPlayerFutureOnly')}
                </li>
              </ul>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setStep('in')}
                  disabled={submitting}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {t('common.back')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {t('gameDetails.swapPlayerConfirm')}
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
