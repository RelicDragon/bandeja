import { useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarPlus,
  Clock,
  Link2,
  MapPin,
  Sparkles,
  Unlink,
  Users,
} from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type {
  EditReservationAction,
  EditReservationActionOption,
  ReservationIntent,
  ReservationIntentOption,
} from '@shared/gameBooking/reservationIntent';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { SegmentedOptionBar } from './SegmentedOptionBar';
import {
  reservationIntentExpandTransition,
  reservationIntentLayoutTransition,
} from './reservationIntentMotion';

type IntentPickerProps = {
  value: ReservationIntent;
  options: ReservationIntentOption[];
  onChange: (intent: ReservationIntent) => void;
  requiredCount?: number;
  selectedBookingCount?: number;
  availableReservationCount?: number;
  showSummary?: boolean;
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

const INTENT_ICONS: Record<ReservationIntent, LucideIcon> = {
  reserveNow: CalendarClock,
  useExisting: Link2,
  gameOnly: Users,
  manualBooked: BadgeCheck,
};

const EDIT_ACTION_ICONS: Record<EditReservationAction, LucideIcon> = {
  keepCurrent: Link2,
  changeGameTimeOnly: Clock,
  useExisting: Link2,
  reserveNew: CalendarPlus,
  unlink: Unlink,
  gameOnly: MapPin,
};

function PickerShell({
  testId,
  title,
  subtitle,
  children,
}: {
  testId: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="overflow-hidden rounded-2xl border border-gray-200/80 bg-gradient-to-b from-gray-50/90 to-white p-3 shadow-sm dark:border-gray-800 dark:from-gray-900/80 dark:to-gray-900"
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ContextPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
      <Sparkles size={10} aria-hidden />
      {children}
    </span>
  );
}

function IntentDetailPanel({
  panelKey,
  description,
  contextHint,
  summary,
  reduceMotion,
}: {
  panelKey: string;
  description: string;
  contextHint?: string;
  summary?: ReactNode;
  reduceMotion: boolean;
}) {
  const expandTransition = reservationIntentExpandTransition(reduceMotion);
  const layoutTransition = reservationIntentLayoutTransition(reduceMotion);

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
        transition={expandTransition}
        className="mt-3 space-y-2"
      >
        <div className="rounded-xl border border-primary-100/80 bg-gradient-to-br from-primary-50/70 via-white to-white px-3 py-2.5 dark:border-primary-500/20 dark:from-primary-950/25 dark:via-gray-900 dark:to-gray-900">
          <p className="text-xs leading-snug text-gray-700 dark:text-gray-300">{description}</p>
          {contextHint ? (
            <div className="mt-2">
              <ContextPill>{contextHint}</ContextPill>
            </div>
          ) : null}
        </div>
        {summary ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...layoutTransition, delay: reduceMotion ? 0 : 0.04 }}
            className="flex gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-3 py-2.5 dark:border-gray-700/80 dark:bg-gray-950/40"
          >
            <ArrowRight
              size={14}
              className="mt-0.5 shrink-0 text-primary-500 dark:text-primary-400"
              aria-hidden
            />
            <div className="min-w-0">{summary}</div>
          </motion.div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}

function IntentSummaryContent({
  intent,
  requiredCount,
  selectedBookingCount,
}: {
  intent: ReservationIntent;
  requiredCount: number;
  selectedBookingCount: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-0.5">
      <p className="text-[11px] font-semibold text-gray-900 dark:text-white">
        {t(`createGame.reservationIntent.summary.${intent}.title`)}
      </p>
      <p className="text-[11px] leading-snug text-gray-600 dark:text-gray-400">
        {t(`createGame.reservationIntent.summary.${intent}.body`, {
          count: requiredCount,
          selected: selectedBookingCount,
        })}
      </p>
    </div>
  );
}

type OptionPickerConfig<T extends string> = {
  value: T;
  options: Array<{ id: T; enabled: boolean; recommended?: boolean }>;
  order: T[];
  testId: string;
  title: string;
  subtitle?: string;
  titleKeyPrefix: string;
  descriptionKeyPrefix: string;
  chipTitleKeyPrefix?: string;
  icons: Record<T, LucideIcon>;
  onChange: (id: T) => void;
  layoutId: string;
  scrollable?: boolean;
  contextHint?: (id: T) => string | undefined;
  renderSummary?: (id: T) => ReactNode;
  showDetailPanel?: boolean;
};

function ModernOptionPicker<T extends string>({
  value,
  options,
  order,
  testId,
  title,
  subtitle,
  titleKeyPrefix,
  descriptionKeyPrefix,
  chipTitleKeyPrefix,
  icons,
  onChange,
  layoutId,
  scrollable = false,
  contextHint,
  renderSummary,
  showDetailPanel = true,
}: OptionPickerConfig<T>) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  const segmentedOptions = order
    .map((id) => byId.get(id))
    .filter((option): option is NonNullable<typeof option> => option != null)
    .map((option) => ({
      id: option.id,
      enabled: option.enabled,
      recommended: option.recommended,
      icon: icons[option.id],
      label: t(
        chipTitleKeyPrefix
          ? `${chipTitleKeyPrefix}.${option.id}.chipTitle`
          : `${titleKeyPrefix}.${option.id}.title`,
      ),
    }));

  const description = t(`${descriptionKeyPrefix}.${value}.description`);
  const hint = contextHint?.(value);
  const summary = renderSummary?.(value);

  return (
    <PickerShell testId={testId} title={title} subtitle={subtitle}>
      <LayoutGroup id={layoutId}>
        <SegmentedOptionBar
          value={value}
          options={segmentedOptions}
          onChange={onChange}
          scrollable={scrollable}
          recommendedLabel={t('createGame.reservationIntent.recommended')}
          layoutId={layoutId}
        />
      </LayoutGroup>
      {showDetailPanel ? (
        <IntentDetailPanel
          panelKey={`${value}-${summary ? 'summary' : 'brief'}`}
          description={description}
          contextHint={hint}
          summary={summary}
          reduceMotion={reduceMotion}
        />
      ) : null}
    </PickerShell>
  );
}

export function ReservationIntentPicker({
  value,
  options,
  onChange,
  requiredCount = 1,
  selectedBookingCount = 0,
  availableReservationCount,
  showSummary = true,
}: IntentPickerProps) {
  const { t } = useTranslation();
  const useExistingWithSelection = value === 'useExisting' && selectedBookingCount > 0;

  return (
    <ModernOptionPicker
      value={value}
      options={options}
      order={INTENT_ORDER}
      testId="reservation-intent-picker"
      title={t('createGame.reservationIntent.title')}
      titleKeyPrefix="createGame.reservationIntent"
      descriptionKeyPrefix="createGame.reservationIntent"
      icons={INTENT_ICONS}
      onChange={onChange}
      layoutId="reservation-intent-segment"
      showDetailPanel={!useExistingWithSelection}
      contextHint={(id) => {
        if (
          id === 'useExisting' &&
          selectedBookingCount === 0 &&
          availableReservationCount != null &&
          availableReservationCount > 0
        ) {
          return t('createGame.reservationIntent.useExisting.contextAvailable', {
            count: availableReservationCount,
          });
        }
        return undefined;
      }}
      renderSummary={
        showSummary
          ? () => (
              <IntentSummaryContent
                intent={value}
                requiredCount={requiredCount}
                selectedBookingCount={selectedBookingCount}
              />
            )
          : undefined
      }
    />
  );
}

export function EditReservationActionPicker({ value, options, onChange }: EditActionPickerProps) {
  const { t } = useTranslation();

  return (
    <ModernOptionPicker
      value={value}
      options={options}
      order={EDIT_ACTION_ORDER}
      testId="edit-reservation-action-picker"
      title={t('gameDetails.locationTime.reservationActionTitle')}
      subtitle={t('gameDetails.locationTime.reservationActionSubtitle')}
      titleKeyPrefix="gameDetails.locationTime.reservationAction"
      descriptionKeyPrefix="gameDetails.locationTime.reservationAction"
      chipTitleKeyPrefix="gameDetails.locationTime.reservationAction"
      icons={EDIT_ACTION_ICONS}
      onChange={onChange}
      layoutId="edit-reservation-action-segment"
      scrollable
    />
  );
}
