import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding } from '@/api/leagues';
import type { BracketPlan } from '@/utils/bracketStructure';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';
import {
  applyPreviewReorderToPlan,
  buildBracketPreviewPositions,
  canSwapBracketPreviewPositions,
  swapBracketPreviewPositions,
  type BracketPreviewPosition,
} from '@/utils/bracketPreviewReorder.util';
import { qualifierLabelForParticipant } from '@/utils/groupQualifierLabel.util';
import {
  feederMatchLabelsForRound,
  firstMainRoundPairingsForPlan,
} from '@/utils/bracketPreviewKnockout.util';

interface BracketPlayoffPreviewProps {
  plan: BracketPlan;
  standingsById: Map<string, LeagueStanding>;
  groupColor?: string | null;
  qualifierLabels?: Map<string, string>;
  reorderable?: boolean;
  onPlanChange?: (plan: BracketPlan) => void;
}

function standingLabel(standing: LeagueStanding | undefined): string {
  if (!standing) return '—';
  if (standing.leagueTeam?.players?.length) {
    return standing.leagueTeam.players
      .map((p) => [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' '))
      .filter(Boolean)
      .join(', ');
  }
  if (standing.user) {
    return [standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ');
  }
  return '—';
}

function SeedChip({
  seed,
  participantId,
  standingsById,
  groupAccent,
  displayLabel,
  ghost,
  reorderable,
  selected,
  onSelect,
}: {
  seed: number;
  participantId?: string;
  standingsById: Map<string, LeagueStanding>;
  groupAccent?: string;
  displayLabel?: string;
  ghost?: boolean;
  reorderable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const standing = participantId ? standingsById.get(participantId) : undefined;
  const teamName = ghost ? '—' : standingLabel(standing);
  const primary = displayLabel ?? teamName;
  const showTeamSubtitle = !!displayLabel && !ghost && teamName !== '—';
  const interactive = reorderable && !ghost && !!participantId && !!onSelect;

  const body = (
    <>
      {!displayLabel && !ghost ? (
        <span className="font-bold text-primary-600 dark:text-primary-400 shrink-0">#{seed}</span>
      ) : null}
      {standing?.leagueTeam?.players?.[0]?.user && !ghost && (
        <PlayerAvatar player={standing.leagueTeam.players[0].user} extrasmall showName={false} fullHideName />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${displayLabel ? 'font-bold' : ''}`}>{primary}</span>
        {showTeamSubtitle ? (
          <span className="block truncate text-[10px] font-normal text-gray-500 dark:text-gray-400">{teamName}</span>
        ) : null}
      </span>
    </>
  );

  if (!interactive) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs min-w-[7rem] ${
          ghost
            ? 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/40 text-gray-500'
            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
        }`}
        style={groupAccent && !ghost ? { borderColor: `${groupAccent}55` } : undefined}
      >
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs min-w-[7rem] text-left transition ${
        selected
          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-400 dark:border-primary-500 dark:bg-primary-950/40'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
      }`}
      style={groupAccent ? { borderColor: selected ? undefined : `${groupAccent}55` } : undefined}
    >
      {body}
    </button>
  );
}

function MatchPair({
  seedA,
  seedB,
  participantAId,
  participantBId,
  standingsById,
  groupAccent,
  qualifierLabels,
  reorderable,
  positionBySeed,
  selectedKey,
  onSelectSeed,
}: {
  seedA: number;
  seedB: number;
  participantAId?: string;
  participantBId?: string;
  standingsById: Map<string, LeagueStanding>;
  groupAccent?: string;
  qualifierLabels?: Map<string, string>;
  reorderable?: boolean;
  positionBySeed: Map<number, BracketPreviewPosition>;
  selectedKey: string | null;
  onSelectSeed: (seed: number) => void;
}) {
  const posA = positionBySeed.get(seedA);
  const posB = positionBySeed.get(seedB);

  return (
    <div className="flex flex-col gap-1">
      <SeedChip
        seed={seedA}
        participantId={participantAId}
        standingsById={standingsById}
        groupAccent={groupAccent}
        displayLabel={qualifierLabelForParticipant(participantAId, qualifierLabels, seedA)}
        reorderable={reorderable && !!posA}
        selected={posA ? selectedKey === posA.key : false}
        onSelect={posA ? () => onSelectSeed(seedA) : undefined}
      />
      <span className="text-[10px] text-center text-gray-400 font-medium">vs</span>
      <SeedChip
        seed={seedB}
        participantId={participantBId}
        standingsById={standingsById}
        groupAccent={groupAccent}
        displayLabel={qualifierLabelForParticipant(participantBId, qualifierLabels, seedB)}
        reorderable={reorderable && !!posB}
        selected={posB ? selectedKey === posB.key : false}
        onSelect={posB ? () => onSelectSeed(seedB) : undefined}
      />
    </div>
  );
}

function FeederMatchPair({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="rounded-md border border-dashed border-gray-200 dark:border-gray-700 px-2 py-2 text-xs text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[7rem]">
        {labelA}
      </div>
      <span className="text-[10px] text-center text-gray-400 font-medium">vs</span>
      <div className="rounded-md border border-dashed border-gray-200 dark:border-gray-700 px-2 py-2 text-xs text-center font-semibold text-gray-500 dark:text-gray-400 min-w-[7rem]">
        {labelB}
      </div>
    </div>
  );
}

export const BracketPlayoffPreview = ({
  plan,
  standingsById,
  groupColor,
  qualifierLabels,
  reorderable = false,
  onPlanChange,
}: BracketPlayoffPreviewProps) => {
  const { t } = useTranslation();
  const accent = groupColor ? getLeagueGroupColor(groupColor) : undefined;

  const [positions, setPositions] = useState<BracketPreviewPosition[]>(() =>
    buildBracketPreviewPositions(plan)
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [swapError, setSwapError] = useState(false);

  const participantOrderKey = useMemo(
    () => plan.orderedParticipantIds.join('\u0000'),
    [plan.orderedParticipantIds]
  );

  useEffect(() => {
    setPositions(buildBracketPreviewPositions(plan));
    setSelectedKey(null);
    setSwapError(false);
  }, [plan, participantOrderKey]);

  const displayPlan = useMemo(
    () => (reorderable ? applyPreviewReorderToPlan(plan, positions) : plan),
    [plan, positions, reorderable]
  );

  const positionBySeed = useMemo(() => new Map(positions.map((p) => [p.seed, p])), [positions]);

  const firstMainPairings = useMemo(
    () => firstMainRoundPairingsForPlan(displayPlan),
    [displayPlan]
  );

  const emitPlan = useCallback(
    (nextPositions: BracketPreviewPosition[]) => {
      if (!onPlanChange) return;
      onPlanChange(applyPreviewReorderToPlan(plan, nextPositions));
    },
    [onPlanChange, plan]
  );

  const handleSelectSeed = useCallback(
    (seed: number) => {
      const pos = positionBySeed.get(seed);
      if (!pos) return;

      if (!selectedKey) {
        setSelectedKey(pos.key);
        setSwapError(false);
        return;
      }
      if (selectedKey === pos.key) {
        setSelectedKey(null);
        return;
      }
      const other = positions.find((p) => p.key === selectedKey);
      if (!other || !canSwapBracketPreviewPositions(other, pos)) {
        setSwapError(true);
        setSelectedKey(pos.key);
        return;
      }
      const next = swapBracketPreviewPositions(positions, selectedKey, pos.key);
      setPositions(next);
      setSelectedKey(null);
      setSwapError(false);
      emitPlan(next);
    },
    [emitPlan, positionBySeed, positions, selectedKey]
  );

  const mainRoundLabel = (roundIndex: number) => {
    const round = displayPlan.mainRounds[roundIndex];
    if (!round) return '';
    const keys: Record<string, string> = {
      final: t('gameDetails.bracketRoundFinal', { defaultValue: 'Final' }),
      semifinals: t('gameDetails.bracketRoundSemifinals', { defaultValue: 'SF' }),
      quarterfinals: t('gameDetails.bracketRoundQuarterfinals', { defaultValue: 'QF' }),
      roundOf16: t('gameDetails.bracketRoundOf16', { defaultValue: 'R16' }),
      roundOf32: t('gameDetails.bracketRoundOf32', { defaultValue: 'R32' }),
    };
    return keys[round.labelKey] ?? round.labelKey;
  };

  const swappableCount = positions.length;

  return (
    <div className="space-y-2">
      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
        {reorderable && swappableCount > 0
          ? t('gameDetails.bracketPreviewReorderHint', {
              defaultValue: 'Tap two teams in the same phase to swap seeds before creating.',
            })
          : t('gameDetails.bracketPreviewHint', { defaultValue: 'Play-in → byes → knockout' })}
      </p>
      {swapError && (
        <p className="text-xs text-center text-amber-600 dark:text-amber-400">
          {t('gameDetails.bracketEditErrorInvalidSwap', {
            defaultValue: 'Those slots cannot be swapped (different phase).',
          })}
        </p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
        {displayPlan.playInGameCount > 0 && (
          <section className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem]">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {t('gameDetails.bracketColumnPlayIn', { defaultValue: 'Play-in' })}
            </h4>
            {displayPlan.playInMatchups.map((m) => (
              <MatchPair
                key={m.matchIndex}
                seedA={m.seedA}
                seedB={m.seedB}
                participantAId={m.participantAId}
                participantBId={m.participantBId}
                standingsById={standingsById}
                groupAccent={accent}
                qualifierLabels={qualifierLabels}
                reorderable={reorderable}
                positionBySeed={positionBySeed}
                selectedKey={selectedKey}
                onSelectSeed={handleSelectSeed}
              />
            ))}
          </section>
        )}

        {displayPlan.byeCount > 0 && (
          <section className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem]">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {t('gameDetails.bracketColumnByes', { defaultValue: 'Byes' })}
            </h4>
            {displayPlan.byeSeeds.map((seed) => {
              const pos = positionBySeed.get(seed);
              const participantId = displayPlan.orderedParticipantIds[seed - 1];
              return (
                <div key={seed} className="space-y-0.5">
                  <SeedChip
                    seed={seed}
                    participantId={participantId}
                    standingsById={standingsById}
                    groupAccent={accent}
                    displayLabel={qualifierLabelForParticipant(participantId, qualifierLabels, seed)}
                    ghost={!reorderable}
                    reorderable={reorderable && !!pos}
                    selected={pos ? selectedKey === pos.key : false}
                    onSelect={pos ? () => handleSelectSeed(seed) : undefined}
                  />
                  <p className="text-[10px] text-center text-gray-400">
                    {t('gameDetails.bracketByeAdvance', { defaultValue: '→ {{round}}', round: mainRoundLabel(0) })}
                  </p>
                </div>
              );
            })}
          </section>
        )}

        {displayPlan.mainRounds.map((round) => (
          <section key={round.roundIndex} className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem]">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {mainRoundLabel(round.roundIndex)}
            </h4>
            {round.roundIndex === 0
              ? firstMainPairings.map(([seedA, seedB], i) => {
                  const participantAId = displayPlan.orderedParticipantIds[seedA - 1];
                  const participantBId = displayPlan.orderedParticipantIds[seedB - 1];
                  const validA = seedA >= 1 && seedA <= displayPlan.entrantCount && participantAId;
                  const validB = seedB >= 1 && seedB <= displayPlan.entrantCount && participantBId;
                  if (!validA || !validB) {
                    const tbd = t('gameDetails.bracketSlotTbd', { defaultValue: 'TBD' });
                    return (
                      <FeederMatchPair
                        key={i}
                        labelA={
                          validA
                            ? (qualifierLabelForParticipant(participantAId, qualifierLabels, seedA) ??
                              `#${seedA}`)
                            : tbd
                        }
                        labelB={
                          validB
                            ? (qualifierLabelForParticipant(participantBId, qualifierLabels, seedB) ??
                              `#${seedB}`)
                            : tbd
                        }
                      />
                    );
                  }
                  return (
                    <MatchPair
                      key={i}
                      seedA={seedA}
                      seedB={seedB}
                      participantAId={participantAId}
                      participantBId={participantBId}
                      standingsById={standingsById}
                      groupAccent={accent}
                      qualifierLabels={qualifierLabels}
                      reorderable={reorderable}
                      positionBySeed={positionBySeed}
                      selectedKey={selectedKey}
                      onSelectSeed={handleSelectSeed}
                    />
                  );
                })
              : Array.from({ length: round.matchCount }, (_, i) => {
                  const [labelA, labelB] = feederMatchLabelsForRound(displayPlan, round.roundIndex, i);
                  return <FeederMatchPair key={i} labelA={labelA} labelB={labelB} />;
                })}
          </section>
        ))}
      </div>
    </div>
  );
};
