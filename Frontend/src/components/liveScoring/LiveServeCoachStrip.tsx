import { useTranslation } from 'react-i18next';
import type { ServeGuideSnapshot } from '@/utils/liveScoring';
import type { LiveTeamSide } from '@/utils/liveScoring';

type LiveServeCoachStripProps = {
  snapshot: ServeGuideSnapshot;
};

export const LiveServeCoachStrip = ({ snapshot }: LiveServeCoachStripProps) => {
  const { t } = useTranslation();

  const serveFromLabel = (s: ServeGuideSnapshot['courtSide']) =>
    s === 'rightDeuce' ? t('gameDetails.liveScoring.serveFromRight') : t('gameDetails.liveScoring.serveFromLeft');

  const teamShort = (team: LiveTeamSide) =>
    team === 'teamA' ? t('gameDetails.liveScoring.teamShortA') : t('gameDetails.liveScoring.teamShortB');

  if (snapshot.changeEndsBeforeNextPoint) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100">
        {t('gameDetails.liveScoring.changeEnds')}
      </div>
    );
  }

  const slot =
    snapshot.tieBreakServeSlot === 'serveOne'
      ? t('gameDetails.liveScoring.serveSlotOne')
      : snapshot.tieBreakServeSlot === 'serveTwo'
        ? t('gameDetails.liveScoring.serveSlotTwo')
        : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/80">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {t('gameDetails.liveScoring.nextServe')}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <div className="text-sm font-bold text-gray-900 dark:text-gray-50">
          {snapshot.serverDisplayName}
          <span className="ml-1 text-xs font-semibold text-gray-500 dark:text-gray-400">({teamShort(snapshot.serverTeam)})</span>
        </div>
      </div>
      <div className="mt-1.5 text-xs font-semibold text-primary-700 dark:text-primary-300">{serveFromLabel(snapshot.courtSide)}</div>
      {slot ? <div className="mt-1 text-[11px] text-gray-600 dark:text-gray-400">{slot}</div> : null}
    </div>
  );
};
