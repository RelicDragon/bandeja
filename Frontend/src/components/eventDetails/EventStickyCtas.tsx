import { useTranslation } from 'react-i18next';
import { ExternalLink, Share2 } from 'lucide-react';
import { Button } from '@/components';
import type { EventViewerIntent } from '@/utils/eventDetails/eventParticipantLists';

type EventStickyCtasProps = {
  intent: EventViewerIntent;
  busy: boolean;
  registerUrl?: string | null;
  onGoing: () => void;
  onLooking: () => void;
  onLeave: () => void;
  onShare: () => void;
  onRegister?: () => void;
};

export function EventStickyCtas({
  intent,
  busy,
  registerUrl,
  onGoing,
  onLooking,
  onLeave,
  onShare,
  onRegister,
}: EventStickyCtasProps) {
  const { t } = useTranslation();

  return (
    <div className="sticky bottom-0 z-20 border-t border-gray-200/80 bg-white/95 px-3 pt-2 backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/95 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          size="sm"
          variant={intent === 'going' ? 'primary' : 'secondary'}
          className="whitespace-normal text-center leading-tight"
          disabled={busy}
          aria-pressed={intent === 'going'}
          onClick={onGoing}
        >
          {t('eventDetails.imGoing')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={intent === 'looking' ? 'primary' : 'secondary'}
          className="whitespace-normal text-center leading-tight"
          disabled={busy}
          aria-pressed={intent === 'looking'}
          onClick={onLooking}
        >
          {t('eventDetails.needPartner')}
        </Button>
      </div>
      <div className={`mt-2 grid gap-2 ${registerUrl ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button type="button" size="sm" variant="outline" onClick={onShare}>
          <Share2 size={16} />
          {t('eventDetails.share')}
        </Button>
        {registerUrl ? (
          <Button type="button" size="sm" variant="outline" onClick={onRegister}>
            <ExternalLink size={16} />
            {t('eventDetails.register')}
          </Button>
        ) : null}
      </div>
      {intent != null && (
        <button
          type="button"
          className="mt-1.5 w-full text-center text-xs font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-400"
          disabled={busy}
          onClick={onLeave}
        >
          {t('eventDetails.notGoing')}
        </button>
      )}
    </div>
  );
}
