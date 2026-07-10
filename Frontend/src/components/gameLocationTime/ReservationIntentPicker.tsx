import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  EditReservationAction,
  EditReservationActionOption,
  ReservationIntent,
  ReservationIntentOption,
} from '@shared/gameBooking/reservationIntent';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type IntentPickerProps = {
  value: ReservationIntent;
  options: ReservationIntentOption[];
  onChange: (intent: ReservationIntent) => void;
};

type EditActionPickerProps = {
  value: EditReservationAction;
  options: EditReservationActionOption[];
  onChange: (action: EditReservationAction) => void;
};

const INTENT_ORDER: ReservationIntent[] = [
  'reserveNow',
  'useExisting',
  'gameOnly',
  'manualBooked',
];

const EDIT_ACTION_ORDER: EditReservationAction[] = [
  'keepCurrent',
  'changeGameTimeOnly',
  'useExisting',
  'reserveNew',
  'unlink',
  'gameOnly',
];

function optionClass(selected: boolean, disabled: boolean): string {
  if (disabled) {
    return 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-900/40 dark:text-gray-600 cursor-not-allowed';
  }
  if (selected) {
    return 'border-primary-500 bg-primary-50 text-primary-950 shadow-sm dark:border-primary-400 dark:bg-primary-950/40 dark:text-primary-50';
  }
  return 'border-gray-200 bg-white text-gray-900 hover:border-primary-300 hover:bg-primary-50/40 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-primary-700 dark:hover:bg-primary-950/20';
}

function MotionOption({
  selected,
  disabled,
  title,
  description,
  badge,
  onClick,
}: {
  selected: boolean;
  disabled: boolean;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
}) {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      initial={false}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.985 }}
      className={`relative w-full rounded-lg border p-3 text-left transition-colors ${optionClass(selected, disabled)}`}
    >
      <span className="block">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-sm font-semibold">{title}</span>
          <span className="flex shrink-0 items-center gap-1">
            {badge ? (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-900/60 dark:text-primary-200">
                {badge}
              </span>
            ) : null}
            <AnimatePresence initial={false}>
              {selected ? (
                <motion.span
                  key="selected"
                  initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduceMotion ? undefined : { opacity: 0, scale: 0.8 }}
                >
                  <CheckCircle2 size={18} className="text-primary-600 dark:text-primary-300" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </span>
        </span>
        <span className="mt-1 block text-xs leading-snug text-gray-600 dark:text-gray-400">
          {description}
        </span>
      </span>
    </motion.button>
  );
}

export function ReservationIntentPicker({ value, options, onChange }: IntentPickerProps) {
  const { t } = useTranslation();
  const byId = new Map(options.map((option) => [option.id, option]));

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('createGame.reservationIntent.title')}
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {INTENT_ORDER.map((id) => {
          const option = byId.get(id);
          if (!option) return null;
          return (
            <MotionOption
              key={id}
              selected={value === id}
              disabled={!option.enabled}
              title={t(`createGame.reservationIntent.${id}.title`)}
              description={t(`createGame.reservationIntent.${id}.description`)}
              badge={option.recommended ? t('createGame.reservationIntent.recommended') : undefined}
              onClick={() => option.enabled && onChange(id)}
            />
          );
        })}
      </div>
    </section>
  );
}

export function EditReservationActionPicker({ value, options, onChange }: EditActionPickerProps) {
  const { t } = useTranslation();
  const byId = new Map(options.map((option) => [option.id, option]));

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('gameDetails.locationTime.reservationActionTitle')}
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('gameDetails.locationTime.reservationActionSubtitle')}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {EDIT_ACTION_ORDER.map((id) => {
          const option = byId.get(id);
          if (!option) return null;
          return (
            <MotionOption
              key={id}
              selected={value === id}
              disabled={!option.enabled}
              title={t(`gameDetails.locationTime.reservationAction.${id}.title`)}
              description={t(`gameDetails.locationTime.reservationAction.${id}.description`)}
              badge={option.recommended ? t('createGame.reservationIntent.recommended') : undefined}
              onClick={() => option.enabled && onChange(id)}
            />
          );
        })}
      </div>
    </section>
  );
}
