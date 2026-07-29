import { Loader2, MapPin, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SharedPlayIntent } from '@/api/playIntents';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { getSportConfig } from '@/sport/sportRegistry';
import { dateKeyInTimezone } from '@/utils/weatherDayGroups';
import { sharedIntentDays, sharedIntentTime } from './sharedPlayIntentLabels';

type Props = {
  intent: SharedPlayIntent;
  open: boolean;
  joining: boolean;
  onOpenChange: (open: boolean) => void;
  onJoin: () => void;
};

export function SharedPlayIntentDialog({
  intent,
  open,
  joining,
  onOpenChange,
  onJoin,
}: Props) {
  const { t } = useTranslation();
  const creatorName =
    [intent.creator.firstName, intent.creator.lastName].filter(Boolean).join(' ') ||
    t('playIntent.friendFallback');
  const todayKey = dateKeyInTimezone(new Date(), intent.city.timezone);
  const when = [
    sharedIntentDays(intent, todayKey, t),
    sharedIntentTime(intent, t),
  ].join(' · ');
  const sport = t(getSportConfig(intent.sport).labelKey);
  const levelLabel =
    intent.minLevel == null && intent.maxLevel == null
      ? null
      : intent.minLevel != null && intent.maxLevel != null
      ? t('playIntent.levelRange', {
          min: intent.minLevel,
          max: intent.maxLevel,
        })
      : intent.minLevel != null
        ? t('playIntent.levelMin', { min: intent.minLevel })
        : t('playIntent.levelMax', { max: intent.maxLevel });
  const initials = creatorName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modalId="shared-play-intent">
      <DialogContent
        data-testid="shared-play-intent-dialog"
        aria-describedby="shared-play-intent-description"
      >
        <DialogHeader className="border-b border-gray-200 p-5 dark:border-gray-800">
          <div className="flex items-center gap-3">
            {intent.creator.avatar ? (
              <img
                src={intent.creator.avatar}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <DialogTitle>{t('playIntent.friendIntentTitle', { name: creatorName })}</DialogTitle>
              <DialogDescription id="shared-play-intent-description">
                {t('playIntent.friendIntentHint')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 p-5">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/5">
            <div className="font-semibold">{sport}</div>
            <div className="mt-1 text-sm text-gray-600 dark:text-gray-300">{when}</div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <MapPin className="h-4 w-4 shrink-0" />
            <span>
              {[intent.clubs.map((club) => club.name).join(', '), intent.city.name]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
          {levelLabel && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <Users className="h-4 w-4 shrink-0" />
              <span>{levelLabel}</span>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-800">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={joining}
            className="h-11 flex-1 rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onJoin}
            disabled={joining}
            data-testid="shared-play-intent-join"
            className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {joining && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('playIntent.playToo')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
