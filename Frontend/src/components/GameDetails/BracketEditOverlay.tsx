import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { PlayerAvatar } from '@/components';
import type { BracketPlayoffResponse, BracketSlotDto, LeagueGroup } from '@/api/leagues';
import { leaguesApi } from '@/api/leagues';
import { bracketEditErrorMessage } from '@/utils/bracketApiError.util';
import { useIsAppOffline } from '@/utils/bracketOffline.util';
import { translateBracketRoundLabel } from '@/utils/bracketRoundDisplay.util';
import {
  bracketEditHasChanges,
  bracketEditIsFullyLocked,
  bracketEditPositionLabel,
  buildEditParticipantPool,
  planBracketEdit,
  resolveEditTreeLayout,
  teamUsersFromParticipant,
  type BracketEditPosition,
} from '@/features/leagueBracket';

export interface BracketEditOverlayProps {
  open: boolean;
  onClose: () => void;
  slots: BracketSlotDto[];
  leagueSeasonId: string;
  roundId?: string;
  canEdit: boolean;
  crossGroupBracket?: boolean;
  groups?: LeagueGroup[];
  onSaved?: (data: BracketPlayoffResponse) => void;
}

function PositionRow({
  pos,
  selected,
  onSelect,
  originLabel,
}: {
  pos: BracketEditPosition;
  selected: boolean;
  onSelect: () => void;
  originLabel?: string | null;
}) {
  const { t } = useTranslation();
  const users = teamUsersFromParticipant(pos.participant);
  const disabled = pos.locked || !pos.participantId;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
        selected
          ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-400 dark:border-primary-500 dark:bg-primary-950/40'
          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      {pos.seed != null && (
        <span className="shrink-0 text-[10px] font-bold text-gray-500 dark:text-gray-400">#{pos.seed}</span>
      )}
      {users.length > 0 ? (
        <div className="flex shrink-0 -space-x-1">
          {users.map((u, i) => (
            <span key={u.id} className="relative rounded-full ring-1 ring-white dark:ring-gray-800" style={{ zIndex: i + 1 }}>
              <PlayerAvatar player={u} inlineFace inlineFacePlain inlineFaceSize="sm" showName={false} subscribePresence={false} asDiv />
            </span>
          ))}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {bracketEditPositionLabel(pos)}
        </span>
        {originLabel ? (
          <span className="block truncate text-[10px] font-medium text-indigo-600 dark:text-indigo-400">{originLabel}</span>
        ) : null}
      </div>
      {pos.slotKind === 'BYE' && (
        <span className="shrink-0 text-[10px] uppercase text-gray-500">{t('gameDetails.bracketBye')}</span>
      )}
    </button>
  );
}

function originLabelForParticipant(
  participant: BracketSlotDto['participant'],
  groups: LeagueGroup[]
): string | null {
  if (!participant) return null;
  if (participant.originGroup?.name) return participant.originGroup.name;
  const id = participant.originGroupId;
  if (!id) return null;
  return groups.find((g) => g.id === id)?.name ?? null;
}

export function BracketEditOverlay({
  open,
  onClose,
  slots,
  leagueSeasonId,
  roundId,
  canEdit,
  crossGroupBracket = false,
  groups = [],
  onSaved,
}: BracketEditOverlayProps) {
  const { t } = useTranslation();
  const offline = useIsAppOffline();
  const initPlan = useMemo(() => planBracketEdit({ mode: 'init', slots }), [slots]);
  const baseline = initPlan.positions;
  const pool = useMemo(() => buildEditParticipantPool(slots), [slots]);

  const [draft, setDraft] = useState<BracketEditPosition[]>(baseline);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(baseline);
    setSelectedKey(null);
    setInlineError(null);
  }, [open, baseline]);

  const dirty = bracketEditHasChanges(baseline, draft);
  const fullyLocked = bracketEditIsFullyLocked(draft);

  const handleSelect = useCallback(
    (key: string) => {
      const pos = draft.find((p) => p.key === key);
      if (!pos || pos.locked || !pos.participantId) return;

      if (!selectedKey) {
        setSelectedKey(key);
        setInlineError(null);
        return;
      }
      if (selectedKey === key) {
        setSelectedKey(null);
        return;
      }

      const swapPlan = planBracketEdit({
        mode: 'swap',
        draft,
        fromKey: selectedKey,
        toKey: key,
        pool,
      });
      if (swapPlan.validationErrors.includes('invalidSwap')) {
        setInlineError(t('gameDetails.bracketEditErrorInvalidSwap'));
        setSelectedKey(key);
        return;
      }
      if (swapPlan.nextDraft) {
        setDraft(swapPlan.nextDraft);
      }
      setSelectedKey(null);
      setInlineError(null);
    },
    [draft, pool, selectedKey, t]
  );

  const handleDiscard = () => {
    setDraft(baseline);
    setSelectedKey(null);
    setInlineError(null);
  };

  const handleSave = async () => {
    if (!canEdit || !dirty) return;
    if (offline) {
      toast.error(t('gameDetails.bracketOfflineAction'));
      return;
    }
    const savePlan = planBracketEdit({ mode: 'save', baseline, draft });
    if (savePlan.payload.length === 0) return;

    setSaving(true);
    setInlineError(null);
    try {
      const res = await leaguesApi.patchBracketSlots(leagueSeasonId, {
        roundId,
        slots: savePlan.payload,
      });
      toast.success(t('gameDetails.bracketEditSaved'));
      onSaved?.(res.data);
      onClose();
    } catch (err) {
      const msg = bracketEditErrorMessage(err, t);
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const treeColumns = useMemo(() => resolveEditTreeLayout(draft), [draft]);

  const columnTitle = (column: ReturnType<typeof resolveEditTreeLayout>[number]) => {
    if (column.kind === 'play-in') return t('gameDetails.bracketColumnPlayIn');
    if (column.kind === 'byes') return t('gameDetails.bracketColumnByes');
    return translateBracketRoundLabel(
      column.roundLabel ?? t('gameDetails.bracketColumnMainRound', { round: column.roundIndex + 1 }),
      t
    );
  };

  if (!open) return null;

  return (
    <Dialog open={open} onClose={onClose} modalId="bracket-edit">
      <DialogContent showCloseButton className="flex max-h-[90vh] flex-col">
        <DialogHeader>
          <DialogTitle>{t('gameDetails.bracketEditTitle')}</DialogTitle>
        </DialogHeader>

        {!canEdit ? (
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketEditErrorSave')}</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {!fullyLocked && (
              <p className="text-xs text-gray-600 dark:text-gray-400">{t('gameDetails.bracketEditHint')}</p>
            )}
            {inlineError && (
              <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-800 dark:bg-red-950/50 dark:text-red-200">
                {inlineError}
              </p>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <p className="mb-2 text-xs text-center text-gray-500 dark:text-gray-400">
                {t('gameDetails.bracketPreviewHint', { defaultValue: 'Play-in ? byes ? knockout' })}
              </p>
              {treeColumns.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                  {treeColumns.map((column, columnIndex) => (
                    <section
                      key={`${column.kind}-${columnIndex}`}
                      className="snap-start shrink-0 flex min-w-[8.5rem] flex-col gap-2"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-center text-gray-500">
                        {columnTitle(column)}
                      </h3>
                      {column.kind === 'byes' &&
                        column.positions.map((pos) => (
                          <PositionRow
                            key={pos.key}
                            pos={pos}
                            selected={selectedKey === pos.key}
                            onSelect={() => handleSelect(pos.key)}
                            originLabel={
                              crossGroupBracket
                                ? originLabelForParticipant(pos.participant, groups)
                                : null
                            }
                          />
                        ))}
                      {(column.kind === 'play-in' || column.kind === 'main') &&
                        column.pairs.map(([posA, posB]) => (
                          <div key={`${posA.key}-${posB.key}`} className="flex flex-col gap-1">
                            <PositionRow
                              pos={posA}
                              selected={selectedKey === posA.key}
                              onSelect={() => handleSelect(posA.key)}
                              originLabel={
                                crossGroupBracket
                                  ? originLabelForParticipant(posA.participant, groups)
                                  : null
                              }
                            />
                            <span className="text-[10px] text-center text-gray-400 font-medium">vs</span>
                            <PositionRow
                              pos={posB}
                              selected={selectedKey === posB.key}
                              onSelect={() => handleSelect(posB.key)}
                              originLabel={
                                crossGroupBracket
                                  ? originLabelForParticipant(posB.participant, groups)
                                  : null
                              }
                            />
                          </div>
                        ))}
                    </section>
                  ))}
                </div>
              ) : null}
              {fullyLocked && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('gameDetails.bracketEditNothingEditable')}</p>
              )}
            </div>

            <div className="flex shrink-0 gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  handleDiscard();
                  onClose();
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-800 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-800"
              >
                {t('gameDetails.bracketEditDiscard')}
              </button>
              <button
                type="button"
                disabled={!dirty || saving || offline}
                title={offline ? t('gameDetails.bracketOfflineAction') : undefined}
                onClick={() => void handleSave()}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('gameDetails.bracketEditSave')}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
