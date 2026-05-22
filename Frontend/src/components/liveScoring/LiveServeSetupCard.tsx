import { useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { BasicUser } from '@/types';
import type { LiveMatchCourtOrientation, LivePointsServeRotation, LiveTeamSide } from '@/utils/liveScoring';
import { LiveCourtEndsSetup } from './LiveCourtEndsSetup';
import { LiveServeSetupPlayerOption } from './LiveServeSetupPlayerOption';
import { LiveServeSetupTeamCard } from './LiveServeSetupTeamCard';
import type { ServeCourtSchemaProps } from './ServeCourtSchema';

type LiveServeSetupCardProps = {
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  CourtSchemaComponent?: ComponentType<ServeCourtSchemaProps>;
  matchDoubles?: boolean;
  showServeRotationRules?: boolean;
  saving?: boolean;
  onComplete: (
    side: LiveTeamSide,
    doublesPlayerIndex: number,
    rotation: LivePointsServeRotation,
    courtOrientation: LiveMatchCourtOrientation
  ) => void;
  onSkipHints: () => void;
};

export const LiveServeSetupCard = ({
  teamAPlayers,
  teamBPlayers,
  CourtSchemaComponent,
  matchDoubles = false,
  showServeRotationRules,
  saving,
  onComplete,
  onSkipHints,
}: LiveServeSetupCardProps) => {
  const { t } = useTranslation();
  const [side, setSide] = useState<LiveTeamSide | null>(null);
  const [doublesIdx, setDoublesIdx] = useState(0);
  const [rotation, setRotation] = useState<LivePointsServeRotation>('official');
  const [courtOrientation, setCourtOrientation] = useState<LiveMatchCourtOrientation>({
    endsSwapped: false,
    teamASidesMirrored: false,
    teamBSidesMirrored: false,
  });

  const roster = side === 'teamA' ? teamAPlayers : side === 'teamB' ? teamBPlayers : [];
  const doubles = matchDoubles;

  const submit = () => {
    if (!side) return;
    onComplete(side, doubles ? doublesIdx : 0, rotation, courtOrientation);
  };

  const rotationOption = (value: LivePointsServeRotation, titleKey: string, descKey: string) => {
    const sel = rotation === value;
    return (
      <button
        type="button"
        className={`w-full rounded-xl border px-3 py-2.5 text-left ${
          sel ? 'border-primary-600 bg-primary-50 dark:bg-primary-950/40' : 'border-gray-300 dark:border-gray-700'
        }`}
        onClick={() => setRotation(value)}
      >
        <div className="text-sm font-bold text-gray-900 dark:text-gray-100">{t(titleKey)}</div>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{t(descKey)}</p>
      </button>
    );
  };

  const teamBlock = (which: LiveTeamSide, players: BasicUser[]) => (
    <LiveServeSetupTeamCard
      side={which}
      label={which === 'teamA' ? t('gameDetails.liveScoring.teamBenchA') : t('gameDetails.liveScoring.teamBenchB')}
      players={players}
      selected={side === which}
      onSelect={() => {
        setSide(which);
        setDoublesIdx(0);
      }}
    />
  );

  return (
    <div className="relative touch-manipulation rounded-3xl border border-primary-200 bg-primary-50/40 p-4 dark:border-primary-900 dark:bg-primary-950/30">
      <div className="text-center text-sm font-bold text-gray-900 dark:text-gray-100">
        {t('gameDetails.liveScoring.serveSetupTitle')}
      </div>
      <p className="mt-1 text-center text-xs text-gray-600 dark:text-gray-400">{t('gameDetails.liveScoring.serveSetupSubtitle')}</p>
      <div className="mt-4 flex flex-col gap-2">
        {teamBlock('teamA', teamAPlayers)}
        {teamBlock('teamB', teamBPlayers)}
      </div>
      {side && doubles ? (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('gameDetails.liveScoring.whichDoublesPlayer')}
          </div>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {roster.slice(0, 2).map((p, idx) => (
              <LiveServeSetupPlayerOption
                key={p.id}
                player={p}
                selected={doublesIdx === idx}
                onSelect={() => setDoublesIdx(idx)}
              />
            ))}
          </div>
        </div>
      ) : null}
      {showServeRotationRules && side ? (
        <div className="mt-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {t('gameDetails.liveScoring.serveRotationRulesLabel')}
          </div>
          {rotationOption(
            'official',
            'gameDetails.liveScoring.serveRotationOfficialTitle',
            'gameDetails.liveScoring.serveRotationOfficialDesc'
          )}
          {rotationOption(
            'simple',
            'gameDetails.liveScoring.serveRotationSimpleTitle',
            'gameDetails.liveScoring.serveRotationSimpleDesc'
          )}
        </div>
      ) : null}
      {side ? (
        <LiveCourtEndsSetup
          teamAPlayers={teamAPlayers}
          teamBPlayers={teamBPlayers}
          CourtSchemaComponent={CourtSchemaComponent}
          matchDoubles={matchDoubles}
          orientation={courtOrientation}
          onOrientationChange={setCourtOrientation}
        />
      ) : null}
      <button
        type="button"
        className="mt-4 w-full rounded-2xl bg-primary-600 py-3 text-sm font-black text-white disabled:opacity-40"
        disabled={!side || saving}
        onClick={submit}
      >
        {t('gameDetails.liveScoring.confirmStart')}
      </button>
      <button type="button" className="mt-2 w-full text-xs text-gray-500 underline dark:text-gray-400" onClick={onSkipHints}>
        {t('gameDetails.liveScoring.skipServeHints')}
      </button>
    </div>
  );
};
