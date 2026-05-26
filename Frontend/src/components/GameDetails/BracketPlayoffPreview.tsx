import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { LeagueStanding } from '@/api/leagues';
import type { BracketPlan } from '@/utils/bracketStructure';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';
import {
  applyPreviewReorderToPlan,
  assignBracketPreviewPosition,
  buildBracketPreviewPositions,
  canSwapBracketPreviewPositions,
  clearBracketPreviewPosition,
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

function buildSlotLabelsForPlan(
  plan: BracketPlan,
  qualifierLabels?: Map<string, string>
): Map<number, string> {
  const labels = new Map<number, string>();
  for (let seed = 1; seed <= plan.entrantCount; seed += 1) {
    const participantId = plan.orderedParticipantIds[seed - 1];
    const label = qualifierLabelForParticipant(participantId, qualifierLabels, seed);
    if (label) labels.set(seed, label);
  }
  return labels;
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

function PreviewMatchFrame({
  children,
  dashed,
}: {
  children: ReactNode;
  dashed?: boolean;
}) {
  return (
    <div
      className={`min-w-[7rem] overflow-visible rounded-lg border bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700 ${
        dashed
          ? 'border-dashed border-gray-300 dark:border-gray-600'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {children}
    </div>
  );
}

function SeedChip({
  seed,
  participantId,
  standingsById,
  groupAccent,
  displayLabel,
  reorderable,
  selected,
  onSelect,
  inMatch,
  matchRow,
  onRemove,
}: {
  seed: number;
  participantId?: string;
  standingsById: Map<string, LeagueStanding>;
  groupAccent?: string;
  displayLabel?: string;
  reorderable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  inMatch?: boolean;
  matchRow?: 'first' | 'last' | 'only';
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const emptySlot = !participantId;
  const standing = participantId ? standingsById.get(participantId) : undefined;
  const teamName = emptySlot ? '—' : standingLabel(standing);
  const primary = displayLabel ?? teamName;
  const showTeamSubtitle = !!displayLabel && !emptySlot && teamName !== '—';
  const interactive = reorderable && !!onSelect && (!emptySlot || !!displayLabel);
  const highlighted = !!selected;
  const showTrash = reorderable && selected && !!participantId && !!onRemove;
  const inMatchRoundClass =
    inMatch && highlighted
      ? matchRow === 'first'
        ? 'rounded-t-lg'
        : matchRow === 'last'
          ? 'rounded-b-lg'
          : matchRow === 'only'
            ? 'rounded-lg'
            : ''
      : '';

  const body = (
    <>
      {!displayLabel && !emptySlot ? (
        <span
          className={`shrink-0 font-bold ${
            highlighted
              ? 'text-primary-700 dark:text-primary-200'
              : 'text-primary-600 dark:text-primary-400'
          }`}
        >
          #{seed}
        </span>
      ) : null}
      {!emptySlot && standing?.leagueTeam?.players?.length ? (() => {
        const teamPlayers = standing.leagueTeam.players.filter((p) => p.user).slice(0, 2);
        const first = teamPlayers[0];
        const second = teamPlayers[1];
        return (
          <div
            className={`relative h-8 shrink-0 ${second ? 'w-12' : 'w-8'}`}
          >
            {second ? (
              <span className="absolute left-4 top-0 z-0 rounded-full ring-1 ring-white dark:ring-gray-800">
                <PlayerAvatar
                  player={second.user}
                  extrasmall
                  showName={false}
                  fullHideName
                  asDiv={interactive}
                />
              </span>
            ) : null}
            {first ? (
              <span className="absolute left-0 top-0 z-10 rounded-full ring-1 ring-white dark:ring-gray-800">
                <PlayerAvatar
                  player={first.user}
                  extrasmall
                  showName={false}
                  fullHideName
                  asDiv={interactive}
                />
              </span>
            ) : null}
          </div>
        );
      })() : !emptySlot && standing?.user ? (
        <PlayerAvatar
          player={standing.user}
          extrasmall
          showName={false}
          fullHideName
          asDiv={interactive}
        />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${displayLabel ? 'font-bold' : ''}`}>{primary}</span>
        {showTeamSubtitle ? (
          <span
            className={`block truncate text-[10px] font-normal ${
              highlighted
                ? 'text-gray-600 dark:text-primary-200/90'
                : 'text-gray-500 dark:text-gray-400'
            }`}
          >
            {teamName}
          </span>
        ) : null}
      </span>
    </>
  );

  const slotClass = inMatch
    ? `flex w-full items-center gap-1.5 px-2 py-1.5 text-xs ${inMatchRoundClass} ${
        emptySlot
          ? 'bg-gray-50/80 dark:bg-gray-800/40 text-gray-500'
          : highlighted
            ? 'text-gray-900 dark:text-primary-50'
            : 'text-gray-900 dark:text-white'
      }`
    : `flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs min-w-[7rem] ${
        emptySlot
          ? 'border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/40 text-gray-500'
          : highlighted
            ? 'text-gray-900 dark:text-primary-50'
            : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
      }`;

  const trashStripRoundClass =
    inMatch && matchRow === 'first'
      ? 'rounded-tr-lg'
      : inMatch && matchRow === 'last'
        ? 'rounded-br-lg'
        : !inMatch
          ? 'rounded-r-md'
          : '';

  const trashOverlay = showTrash ? (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onRemove?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onRemove?.();
        }
      }}
      className={`absolute inset-y-0 right-0 z-20 flex w-10 shrink-0 cursor-pointer items-center justify-center border-l border-red-200/70 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/70 dark:text-red-400 dark:hover:bg-red-950 ${trashStripRoundClass}`}
      aria-label={t('common.remove', { defaultValue: 'Remove' })}
    >
      <Trash2 size={16} strokeWidth={2.25} />
    </div>
  ) : null;

  const chipShellClass = `${slotClass}${showTrash ? ' relative overflow-hidden' : ''}`;

  if (!interactive) {
    return (
      <div
        className={chipShellClass}
        style={groupAccent && !emptySlot && !inMatch ? { borderColor: `${groupAccent}55` } : undefined}
      >
        {body}
        {trashOverlay}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`${chipShellClass} text-left transition ${
        inMatch
          ? highlighted
            ? 'bg-primary-50 ring-1 ring-inset ring-primary-400/80 dark:bg-primary-500/25 dark:ring-primary-400/50'
            : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
          : highlighted
            ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-400 dark:border-primary-400 dark:bg-primary-500/25 dark:ring-primary-400/50'
            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500'
      }`}
      style={groupAccent && !inMatch ? { borderColor: selected ? undefined : `${groupAccent}55` } : undefined}
    >
      {body}
      {trashOverlay}
    </button>
  );
}

function MatchPair({
  seedA,
  seedB,
  standingsById,
  groupAccent,
  qualifierLabels,
  reorderable,
  positionBySeed,
  selectedKey,
  onSelectSeed,
  onRemoveSelected,
}: {
  seedA: number;
  seedB: number;
  standingsById: Map<string, LeagueStanding>;
  groupAccent?: string;
  qualifierLabels?: Map<string, string>;
  reorderable?: boolean;
  positionBySeed: Map<number, BracketPreviewPosition>;
  selectedKey: string | null;
  onSelectSeed: (seed: number) => void;
  onRemoveSelected: () => void;
}) {
  const posA = positionBySeed.get(seedA);
  const posB = positionBySeed.get(seedB);
  const labelA =
    posA?.slotLabel ?? qualifierLabelForParticipant(posA?.participantId ?? undefined, qualifierLabels, seedA);
  const labelB =
    posB?.slotLabel ?? qualifierLabelForParticipant(posB?.participantId ?? undefined, qualifierLabels, seedB);

  const removeA =
    reorderable && posA && selectedKey === posA.key && posA.participantId ? onRemoveSelected : undefined;
  const removeB =
    reorderable && posB && selectedKey === posB.key && posB.participantId ? onRemoveSelected : undefined;

  return (
    <PreviewMatchFrame>
      <SeedChip
        seed={seedA}
        participantId={posA?.participantId ?? undefined}
        standingsById={standingsById}
        groupAccent={groupAccent}
        displayLabel={labelA}
        reorderable={reorderable && !!posA}
        selected={posA ? selectedKey === posA.key : false}
        onSelect={posA ? () => onSelectSeed(seedA) : undefined}
        inMatch
        matchRow="first"
        onRemove={removeA}
      />
      <SeedChip
        seed={seedB}
        participantId={posB?.participantId ?? undefined}
        standingsById={standingsById}
        groupAccent={groupAccent}
        displayLabel={labelB}
        reorderable={reorderable && !!posB}
        selected={posB ? selectedKey === posB.key : false}
        onSelect={posB ? () => onSelectSeed(seedB) : undefined}
        inMatch
        matchRow="last"
        onRemove={removeB}
      />
    </PreviewMatchFrame>
  );
}

function FeederMatchPair({ labelA, labelB }: { labelA: string; labelB: string }) {
  return (
    <PreviewMatchFrame dashed>
      <div className="px-2 py-2 text-xs text-center font-semibold text-gray-500 dark:text-gray-400">
        {labelA}
      </div>
      <div className="px-2 py-2 text-xs text-center font-semibold text-gray-500 dark:text-gray-400">
        {labelB}
      </div>
    </PreviewMatchFrame>
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

  const slotLabels = useMemo(
    () => buildSlotLabelsForPlan(plan, qualifierLabels),
    [plan, qualifierLabels]
  );

  const [positions, setPositions] = useState<BracketPreviewPosition[]>(() =>
    buildBracketPreviewPositions(plan, slotLabels)
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState<string | null>(null);
  const [unassignedIds, setUnassignedIds] = useState<string[]>([]);
  const [swapError, setSwapError] = useState(false);

  const participantOrderKey = useMemo(
    () => plan.orderedParticipantIds.join('\u0000'),
    [plan.orderedParticipantIds]
  );

  const allBracketSlotsFilled = useMemo(
    () => plan.orderedParticipantIds.filter(Boolean).length === plan.entrantCount,
    [plan.orderedParticipantIds, plan.entrantCount]
  );

  useEffect(() => {
    if (!allBracketSlotsFilled) return;
    setPositions(buildBracketPreviewPositions(plan, slotLabels));
    setUnassignedIds([]);
    setSelectedKey(null);
    setSelectedUnassignedId(null);
    setSwapError(false);
  }, [plan, participantOrderKey, slotLabels, allBracketSlotsFilled]);

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

  const handleClearSelected = useCallback(() => {
    if (!selectedKey) return;
    const cleared = positions.find((p) => p.key === selectedKey);
    const removedId = cleared?.participantId;
    if (!removedId) return;
    const next = clearBracketPreviewPosition(positions, selectedKey);
    setPositions(next);
    setUnassignedIds((prev) => (prev.includes(removedId) ? prev : [...prev, removedId]));
    setSelectedKey(null);
    setSwapError(false);
    emitPlan(next);
  }, [emitPlan, positions, selectedKey]);

  const handleSelectSeed = useCallback(
    (seed: number) => {
      const pos = positionBySeed.get(seed);
      if (!pos) return;

      if (selectedUnassignedId) {
        if (!pos.participantId) {
          const next = assignBracketPreviewPosition(positions, pos.key, selectedUnassignedId);
          setPositions(next);
          setUnassignedIds((prev) => prev.filter((id) => id !== selectedUnassignedId));
          setSelectedUnassignedId(null);
          setSwapError(false);
          emitPlan(next);
        }
        return;
      }

      if (!pos.participantId) return;

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
    [emitPlan, positionBySeed, positions, selectedKey, selectedUnassignedId]
  );

  const handleSelectUnassigned = useCallback((participantId: string) => {
    setSelectedUnassignedId((prev) => (prev === participantId ? null : participantId));
    setSelectedKey(null);
    setSwapError(false);
  }, []);

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
      <div className="flex gap-4 overflow-x-auto py-1 pl-2 pr-10 pb-2 snap-x snap-mandatory">
        {displayPlan.playInGameCount > 0 && (
          <section className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem] overflow-visible">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {t('gameDetails.bracketColumnPlayIn', { defaultValue: 'Play-in' })}
            </h4>
            {displayPlan.playInMatchups.map((m) => (
              <MatchPair
                key={m.matchIndex}
                seedA={m.seedA}
                seedB={m.seedB}
                standingsById={standingsById}
                groupAccent={accent}
                qualifierLabels={qualifierLabels}
                reorderable={reorderable}
                positionBySeed={positionBySeed}
                selectedKey={selectedKey}
                onSelectSeed={handleSelectSeed}
                onRemoveSelected={handleClearSelected}
              />
            ))}
          </section>
        )}

        {displayPlan.byeCount > 0 && (
          <section className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem] overflow-visible">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {t('gameDetails.bracketColumnByes', { defaultValue: 'Byes' })}
            </h4>
            {displayPlan.byeSeeds.map((seed) => {
              const pos = positionBySeed.get(seed);
              const participantId = pos?.participantId ?? undefined;
              return (
                <div key={seed} className="space-y-0.5">
                  <SeedChip
                    seed={seed}
                    participantId={participantId}
                    standingsById={standingsById}
                    groupAccent={accent}
                    displayLabel={
                      pos?.slotLabel ??
                      qualifierLabelForParticipant(participantId, qualifierLabels, seed)
                    }
                    reorderable={reorderable && !!pos}
                    selected={pos ? selectedKey === pos.key : false}
                    onSelect={pos ? () => handleSelectSeed(seed) : undefined}
                    onRemove={pos && selectedKey === pos.key ? handleClearSelected : undefined}
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
          <section key={round.roundIndex} className="snap-start shrink-0 flex flex-col gap-2 min-w-[8.5rem] overflow-visible">
            <h4 className="text-xs font-semibold text-center text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              {mainRoundLabel(round.roundIndex)}
            </h4>
            {round.roundIndex === 0
              ? firstMainPairings.map(([seedA, seedB], i) => {
                  const posA = positionBySeed.get(seedA);
                  const posB = positionBySeed.get(seedB);
                  const participantAId = posA?.participantId ?? displayPlan.orderedParticipantIds[seedA - 1];
                  const participantBId = posB?.participantId ?? displayPlan.orderedParticipantIds[seedB - 1];
                  if (!reorderable && (!participantAId || !participantBId)) {
                    const tbd = t('gameDetails.bracketSlotTbd', { defaultValue: 'TBD' });
                    return (
                      <FeederMatchPair
                        key={i}
                        labelA={
                          participantAId
                            ? (qualifierLabelForParticipant(participantAId, qualifierLabels, seedA) ??
                              `#${seedA}`)
                            : tbd
                        }
                        labelB={
                          participantBId
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
                      standingsById={standingsById}
                      groupAccent={accent}
                      qualifierLabels={qualifierLabels}
                      reorderable={reorderable}
                      positionBySeed={positionBySeed}
                      selectedKey={selectedKey}
                      onSelectSeed={handleSelectSeed}
                      onRemoveSelected={handleClearSelected}
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

      {reorderable && unassignedIds.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            {t('gameDetails.bracketPreviewUnassignedLabel', {
              defaultValue: 'Unassigned teams',
            })}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
          {unassignedIds.map((id) => {
            const standing = standingsById.get(id);
            const name = standingLabel(standing);
            const selected = selectedUnassignedId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectUnassigned(id)}
                className={`max-w-[10rem] rounded-md border px-2 py-1 text-xs font-medium transition ${
                  selected
                    ? 'border-primary-500 bg-primary-50 text-gray-900 ring-1 ring-primary-400 dark:border-primary-400 dark:bg-primary-500/25 dark:text-primary-50'
                    : 'border-gray-200 bg-white text-gray-800 hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
                }`}
              >
                <span className="block truncate">{name}</span>
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
};
