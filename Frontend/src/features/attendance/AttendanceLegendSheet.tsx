/**
 * PRD 346 — "What the dots mean".
 *
 * The legend used to be a one-line toast, which is the one thing a legend must
 * not be: it explained four colours in a sentence and then disappeared. This is
 * the same content as the surface the design language already prescribes for
 * detail — a bottom sheet — with each dot drawn next to its own meaning, so the
 * mapping is visual rather than described.
 *
 * It is reached by pressing a dot or the 44 px "What the dots mean" button
 * (`AttendanceLegendButton`); the organizer caption under the progress pill
 * still carries the same information unconditionally, so nothing here is the
 * only route to it.
 */
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Drawer, DrawerCloseButton, DrawerContent, DrawerHandle } from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { attendanceDotStyle, type AttendanceDotState } from './attendanceVisuals';

const MODAL_ID = 'attendance-legend-sheet';

/** Roster order: the two answers, then silence, then the after-the-game note. */
const LEGEND_STATES: AttendanceDotState[] = ['CONFIRMED', 'UNSURE', 'UNANSWERED', 'NO_SHOW'];

export interface AttendanceLegendSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AttendanceLegendSheet({ open, onClose }: AttendanceLegendSheetProps) {
  const { t } = useTranslation();
  useBackButtonModal(open, onClose, MODAL_ID);

  return (
    <Drawer
      open={open}
      handleOnly
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="flex flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby={`${MODAL_ID}-title`}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-3">
          <h2
            id={`${MODAL_ID}-title`}
            className="min-w-0 flex-1 text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
          >
            {t('attendance.legend.title')}
          </h2>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>

        <ul className="flex flex-col gap-3 px-4 pb-2" data-testid="attendance-legend-list">
          {LEGEND_STATES.map((state) => {
            const style = attendanceDotStyle(state);
            return (
              <li key={state} className="flex items-center gap-3">
                <span
                  aria-hidden
                  data-attendance-state={state}
                  className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] ${style.className}`}
                >
                  {state === 'CONFIRMED' ? <Check size={9} strokeWidth={3.5} /> : null}
                  {state === 'UNSURE' ? <span className="font-bold leading-none">?</span> : null}
                </span>
                <span className="text-sm text-gray-800 dark:text-gray-100">
                  {t(style.labelKey)}
                </span>
              </li>
            );
          })}
        </ul>

        {/* The product principle, restated where the dots are explained. */}
        <p className="px-4 pb-6 pt-2 text-xs text-gray-500 dark:text-gray-400">
          {t('attendance.caption')}
        </p>
      </DrawerContent>
    </Drawer>
  );
}
