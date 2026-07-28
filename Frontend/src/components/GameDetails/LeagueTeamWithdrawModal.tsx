import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { leaguesApi, type LeagueStanding } from '@/api/leagues';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';

interface LeagueTeamWithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueSeasonId: string;
  participant: LeagueStanding;
  onWithdrawn: () => void;
}

export function LeagueTeamWithdrawModal({
  isOpen,
  onClose,
  leagueSeasonId,
  participant,
  onWithdrawn,
}: LeagueTeamWithdrawModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);

  const teamLabel =
    participant.leagueTeam?.players
      .map((p) => formatFixtureMatrixPlayerName(p.user))
      .filter(Boolean)
      .join(' / ') || t('gameDetails.team');

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await leaguesApi.withdrawTeam(leagueSeasonId, participant.id);
      toast.success(t('gameDetails.withdrawTeamSuccess'));
      onWithdrawn();
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('gameDetails.withdrawTeamError');
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('gameDetails.withdrawTeamTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>{t('gameDetails.withdrawTeamBody', { team: teamLabel })}</p>
          <ul className="list-disc space-y-1 pl-5 text-xs text-gray-600 dark:text-gray-400">
            <li>{t('gameDetails.withdrawTeamBulletTechnical')}</li>
            <li>{t('gameDetails.withdrawTeamBulletStandings')}</li>
            <li>{t('gameDetails.withdrawTeamBulletIrreversible')}</li>
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleConfirm()}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
              {t('gameDetails.withdrawTeamConfirm')}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
