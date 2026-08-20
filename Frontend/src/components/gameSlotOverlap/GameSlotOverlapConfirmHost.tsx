import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useGameSlotOverlapConfirmStore } from '@/store/gameSlotOverlapConfirmStore';

export function GameSlotOverlapConfirmHost() {
  const { t } = useTranslation();
  const open = useGameSlotOverlapConfirmStore((s) => s.open);
  const settle = useGameSlotOverlapConfirmStore((s) => s.settle);

  return (
    <Dialog open={open} onClose={() => settle(false)} modalId="game-slot-overlap-confirm">
      <DialogContent
        showCloseButton={false}
        className="w-[min(90vw,19rem)] max-w-[19rem] overflow-hidden p-0 shadow-xl"
      >
        <div className="px-5 pt-5 pb-4">
          <DialogTitle className="pr-0 text-base font-semibold leading-snug tracking-tight">
            {t('games.overlapConfirmTitle')}
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-snug text-gray-600 dark:text-gray-400">
            {t('games.overlapConfirmMessage')}
          </DialogDescription>
        </div>
        <div className="flex gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => settle(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" className="flex-1" onClick={() => settle(true)}>
            {t('games.overlapConfirmProceed')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
