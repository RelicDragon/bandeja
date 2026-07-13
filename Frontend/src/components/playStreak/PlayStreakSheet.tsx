import { useTranslation } from 'react-i18next';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/Drawer';
import type { PlayStreakView } from '@/types/playStreak';

type PlayStreakSheetProps = {
  streak: PlayStreakView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwn?: boolean;
};

function formatDeadline(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(new Date(iso));
  } catch {
    return null;
  }
}

export function PlayStreakSheet({ streak, open, onOpenChange, isOwn = false }: PlayStreakSheetProps) {
  const { t, i18n } = useTranslation();
  const deadlineLabel = formatDeadline(streak.deadlineAt, i18n.language);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg px-4 pb-8">
        <DrawerHeader className="text-left">
          <DrawerTitle>{t('playStreak.sheetTitle')}</DrawerTitle>
          <DrawerDescription>{t('playStreak.rules')}</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">{t('playStreak.current')}</span>
            <span className="font-semibold">
              {streak.current > 0
                ? t('playStreak.weeks', { count: streak.current })
                : t('playStreak.none')}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-gray-500 dark:text-gray-400">{t('playStreak.best')}</span>
            <span className="font-semibold">{t('playStreak.weeks', { count: streak.best })}</span>
          </div>
          {isOwn && streak.current > 0 && deadlineLabel && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {t('playStreak.playBy', { date: deadlineLabel })}
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
