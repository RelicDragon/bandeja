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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg px-4 pb-8">
        <DrawerHeader className="text-left">
          <div className="mb-4 flex justify-center">
            <TrophyRarityFrame
              rarity={definition.rarity}
              locked={locked}
              className="h-28 w-28 rounded-3xl"
              innerClassName="rounded-[22px]"
            >
              <TrophyArt artKey={definition.artKey} locked={locked} className="h-[4.5rem] w-[5.5rem]" />
            </TrophyRarityFrame>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TrophyRarityBadge rarity={definition.rarity} locked={locked} />
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
            <p className="text-gray-600 dark:text-gray-300">
              {progress
                ? t('trophies.detail.progress', {
                    current: progress.current,
                    target: progress.target,
                  })
                : t('trophies.detail.lockedHint')}
            </p>
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
