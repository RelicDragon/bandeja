import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';

type Props = {
  mode: 'loading' | 'joining';
};

export function SharedPlayIntentProgressDialog({ mode }: Props) {
  const { t } = useTranslation();
  const joining = mode === 'joining';

  return (
    <Dialog open modalId="shared-play-intent-progress">
      <DialogContent
        showCloseButton={false}
        closeOnInteractOutside={false}
        aria-describedby="shared-play-intent-progress-description"
        className="max-w-sm p-6"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
          <div className="min-w-0">
            <DialogTitle className="pr-0">
              {t(
                joining
                  ? 'playIntent.sharedJoiningTitle'
                  : 'playIntent.sharedLoadingTitle',
              )}
            </DialogTitle>
            <DialogDescription id="shared-play-intent-progress-description">
              {t(
                joining
                  ? 'playIntent.sharedJoiningHint'
                  : 'playIntent.sharedLoadingHint',
              )}
            </DialogDescription>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
