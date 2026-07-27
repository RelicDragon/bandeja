import { useTranslation } from 'react-i18next';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/Drawer';
import { TrophyArt } from '@/components/trophies/TrophyArt';
import { TrophyPinControls } from '@/components/trophies/TrophyPinControls';
import { TrophyRarityBadge } from '@/components/trophies/TrophyRarityBadge';
import { TrophyRarityFrame } from '@/components/trophies/TrophyRarityFrame';
import { isCatalogFamilyMaxLevel } from '@/components/trophies/cabinetGrouping';
import {
  trophyFrameLocked,
  trophyMaxLevelDisplayRarity,
  trophyProgressFillClass,
} from '@/components/trophies/trophyProgressStyles';
import type {
  TrophyDefinitionView,
  TrophyInstanceView,
} from '@/types/trophies';
import { getSportConfig } from '@/sport/sportRegistry';
import type { Sport } from '@/types';
import { buildUrl } from '@/utils/urlSchema';
import { useNavigate } from 'react-router-dom';

type TrophyDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definition: TrophyDefinitionView;
  instance: TrophyInstanceView | null;
  instances: TrophyInstanceView[];
  locked: boolean;
  progress: { current: number; target: number } | null;
  /** Explicit family max from a stack; omit to resolve from catalog. */
  isMaxLevel?: boolean;
  isOwn: boolean;
  pinsEditable?: boolean;
  pinnedInstanceIds?: ReadonlySet<string> | readonly string[];
  ownerUserId?: string;
};

function formatEarned(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function pinnedSet(
  ids: ReadonlySet<string> | readonly string[] | undefined,
): Set<string> {
  if (!ids) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

function sportLabelFor(
  sport: string | null | undefined,
  t: (key: string) => string,
): string | null {
  if (!sport) return null;
  try {
    return t(getSportConfig(sport as Sport).labelKey);
  } catch {
    return null;
  }
}

export function TrophyDetailSheet({
  open,
  onOpenChange,
  definition,
  instance,
  instances,
  locked,
  progress,
  isMaxLevel,
  isOwn,
  pinsEditable = false,
  pinnedInstanceIds,
  ownerUserId,
}: TrophyDetailSheetProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const pinned = pinnedSet(pinnedInstanceIds);
  const anyPinned = instances.some((row) => pinned.has(row.id)) || (instance ? pinned.has(instance.id) : false);
  const sportLabel = sportLabelFor(instance?.sport, t);
  const deepLinkId = instance?.source?.gameId || instance?.source?.entityId;
  const sourceTitle = instance?.source?.title?.trim() || null;
  const canPin = isOwn && pinsEditable && !locked && Boolean(ownerUserId);
  const showStackedPins = canPin && instances.length > 1;
  const maxLevel =
    typeof isMaxLevel === 'boolean'
      ? isMaxLevel
      : isCatalogFamilyMaxLevel(definition);
  const displayRarity = trophyMaxLevelDisplayRarity(maxLevel, definition.rarity);
  const frameLocked = trophyFrameLocked(locked, maxLevel);
  const progressPercent =
    progress &&
    progress.target > 0 &&
    Number.isFinite(progress.current) &&
    Number.isFinite(progress.target)
      ? Math.min(100, Math.max(0, (progress.current / progress.target) * 100))
      : 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg px-4 pb-8">
        <DrawerHeader className="text-left">
          <div className="mb-4 flex justify-center">
            <TrophyRarityFrame
              rarity={displayRarity}
              locked={frameLocked}
              className="h-28 w-28 rounded-3xl"
            >
              <TrophyArt artKey={definition.artKey} locked={locked} className="h-[4.5rem] w-[5.5rem]" />
            </TrophyRarityFrame>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TrophyRarityBadge
              rarity={displayRarity}
              locked={frameLocked}
            />
            {anyPinned && (
              <span className="rounded-full bg-primary-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                {t('trophies.detail.pinnedBadge')}
              </span>
            )}
          </div>
          <DrawerTitle>{t(definition.titleKey)}</DrawerTitle>
          <DrawerDescription>{t(definition.descriptionKey)}</DrawerDescription>
        </DrawerHeader>

        <div className="space-y-3 px-1 text-sm">
          {locked && isOwn && (
            progress ? (
              <div
                data-testid="trophy-detail-progress"
                data-max-level={maxLevel ? 'true' : 'false'}
                className={
                  maxLevel
                    ? 'relative overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white px-5 py-4 text-center shadow-[0_14px_30px_-24px_rgba(245,158,11,0.75)] dark:border-amber-500/25 dark:from-amber-950/40 dark:to-white/[0.03]'
                    : 'relative overflow-hidden rounded-3xl border border-emerald-100/80 bg-gradient-to-b from-emerald-50/90 to-white px-5 py-4 text-center shadow-[0_14px_30px_-24px_rgba(16,185,129,0.7)] dark:border-emerald-500/20 dark:from-emerald-950/35 dark:to-white/[0.03]'
                }
                aria-label={t('trophies.detail.progress', {
                  current: progress.current,
                  target: progress.target,
                })}
              >
                <div
                  className={
                    maxLevel
                      ? 'pointer-events-none absolute inset-x-10 -top-8 h-16 rounded-full bg-amber-400/20 blur-2xl dark:bg-amber-400/10'
                      : 'pointer-events-none absolute inset-x-10 -top-8 h-16 rounded-full bg-emerald-400/15 blur-2xl dark:bg-emerald-400/10'
                  }
                  aria-hidden
                />
                <div className="relative">
                  <div className="relative flex items-baseline justify-center">
                    <div
                      data-testid="trophy-detail-progress-value"
                      className="flex items-baseline justify-center gap-1.5 tabular-nums"
                    >
                      <span className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                        {progress.current}
                      </span>
                      <span className="text-sm font-bold text-gray-400 dark:text-gray-500">
                        / {progress.target}
                      </span>
                    </div>
                    <span
                      data-testid="trophy-detail-progress-percent"
                      className={
                        maxLevel
                          ? 'absolute right-0 text-sm font-bold tabular-nums text-amber-700 dark:text-amber-300'
                          : 'absolute right-0 text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-300'
                      }
                    >
                      {Math.round(progressPercent)}%
                    </span>
                  </div>

                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200/90 p-0.5 shadow-inner dark:bg-white/10">
                    <div
                      data-testid="trophy-detail-progress-bar"
                      data-max-level={maxLevel ? 'true' : 'false'}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressPercent)}
                      className={`relative h-full overflow-hidden rounded-full transition-[width] duration-500 ease-out ${trophyProgressFillClass(maxLevel)} ${
                        maxLevel
                          ? 'shadow-[0_0_12px_rgba(245,158,11,0.45)]'
                          : 'shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    >
                      <span
                        className="absolute inset-0 bg-gradient-to-b from-white/45 via-transparent to-transparent"
                        aria-hidden
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="rounded-2xl bg-gray-50/90 px-4 py-3 text-center text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
                {t('trophies.detail.lockedHint')}
              </p>
            )
          )}

          {!locked && instance && (
            <div className="space-y-2 rounded-2xl bg-gray-50/90 px-3.5 py-3 dark:bg-white/[0.04]">
              <p className="text-gray-700 dark:text-gray-200">
                {t('trophies.detail.earnedOn', {
                  date: formatEarned(instance.earnedAt, i18n.language),
                })}
              </p>
              {sportLabel && (
                <p className="text-gray-600 dark:text-gray-300">
                  {t('trophies.detail.sport', { sport: sportLabel })}
                </p>
              )}
              {sourceTitle && (
                <p className="font-medium text-gray-800 dark:text-gray-100">{sourceTitle}</p>
              )}
              {instances.length > 1 && (
                <p className="text-gray-600 dark:text-gray-300">
                  {t('trophies.detail.timesEarned', { count: instances.length })}
                </p>
              )}
              {deepLinkId && (
                <button
                  type="button"
                  className="font-semibold text-primary-600 underline-offset-2 hover:underline dark:text-primary-400"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(buildUrl('game', { id: deepLinkId }));
                  }}
                >
                  {t('trophies.detail.openEvent')}
                </button>
              )}
            </div>
          )}

          {canPin && ownerUserId && !showStackedPins && instance && (
            <TrophyPinControls
              achievementId={instance.id}
              isPinned={pinned.has(instance.id)}
              ownerUserId={ownerUserId}
              className="pt-1"
            />
          )}

          {showStackedPins && ownerUserId && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {t('trophies.detail.pinWhich')}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {t('trophies.detail.pinHint')}
              </p>
              {instances.map((row) => {
                const rowSport = sportLabelFor(row.sport, t);
                const rowTitle = row.source?.title?.trim() || null;
                return (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3 dark:border-gray-700/60 dark:bg-gray-900/50"
                  >
                    <div className="mb-2 space-y-0.5 text-xs text-gray-600 dark:text-gray-300">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span>
                          {t('trophies.detail.earnedOn', {
                            date: formatEarned(row.earnedAt, i18n.language),
                          })}
                        </span>
                        {rowSport && <span>{rowSport}</span>}
                      </div>
                      {rowTitle && (
                        <p className="font-medium text-gray-800 dark:text-gray-100">{rowTitle}</p>
                      )}
                    </div>
                    <TrophyPinControls
                      achievementId={row.id}
                      isPinned={pinned.has(row.id)}
                      ownerUserId={ownerUserId}
                      compact
                      showHint={false}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
