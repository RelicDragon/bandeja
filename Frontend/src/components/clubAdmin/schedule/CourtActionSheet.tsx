/**
 * Cancel a game / release its court, and tell the host. The preview is built on the club's wall
 * clock in the message language; once the operator edits it, regenerating (reason/note changes)
 * stops and their text is sent verbatim. Untouched, the message is omitted and the server writes
 * it in the host's own language.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { ScheduleGameSlot } from '@shared/clubAdmin/contract';
import { useGameCourtActionMutation } from '@/queries/clubAdmin';
import { ConsoleSheet } from '../console/ConsoleSheet';
import { Field, FilterChips, inputClass } from '../console/controls';
import type { ConsoleFormat } from '../console/format';
import { buttonClass, cx } from '../console/classes';
import { buildCancelMessage, type CourtActionMode } from './cancelMessage';

const REASONS = ['maintenance', 'weather', 'doubleBooking', 'clubEvent', 'other'] as const;
type ReasonKey = (typeof REASONS)[number];

export function CourtActionSheet({
  open,
  onOpenChange,
  mode,
  game,
  clubId,
  clubName,
  timeZone,
  fmt,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CourtActionMode;
  game: ScheduleGameSlot | null;
  clubId: string;
  clubName: string;
  timeZone: string;
  fmt: ConsoleFormat;
  onDone?: () => void;
}) {
  const { t, i18n } = useTranslation('clubAdmin');
  const action = useGameCourtActionMutation(clubId);
  const [reasonKey, setReasonKey] = useState<ReasonKey | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReasonKey(null);
    setCustomReason('');
    setNote('');
    setNotify(true);
    setEdited(false);
  }, [open, game?.gameId, mode]);

  const reason = reasonKey === 'other' ? customReason.trim() : reasonKey ? t(`courtAction.reasons.${reasonKey}`) : '';
  const language = i18n.language;
  const generated = useMemo(() => {
    if (!game) return '';
    return buildCancelMessage({
      mode,
      hostFirstName: game.host.firstName,
      clubName,
      startTime: game.startTime,
      timeZone,
      language,
      reason,
      note,
      t: i18n.getFixedT(language, 'clubAdmin'),
    });
  }, [game, mode, clubName, timeZone, language, reason, note, i18n]);

  useEffect(() => {
    if (!edited) setMessage(generated);
  }, [generated, edited]);

  if (!game) return null;

  const disabledReason = !reason ? t('courtAction.needReason') : notify && !message.trim() ? t('courtAction.needMessage') : null;

  const submit = async () => {
    try {
      await action.mutateAsync({
        gameId: game.gameId,
        mode,
        body: {
          reason,
          note: note.trim() || null,
          notifyHost: notify,
          ...(notify && edited ? { message: message.trim() } : {}),
        },
      });
      onOpenChange(false);
      onDone?.();
    } catch {
      // toast shown by the mutation; the sheet stays open with the operator's input.
    }
  };

  return (
    <ConsoleSheet
      open={open}
      onOpenChange={(o) => !action.isPending && onOpenChange(o)}
      modalId="club-admin-court-action"
      nested
      title={mode === 'cancel' ? t('courtAction.cancelTitle') : t('courtAction.clearTitle')}
      description={fmt.dateTime(game.startTime)}
      footer={
        <div className="space-y-2">
          {disabledReason ? <p className="text-center text-xs text-muted-foreground">{disabledReason}</p> : null}
          <button
            type="button"
            className={buttonClass('danger', 'w-full')}
            disabled={!!disabledReason || action.isPending}
            onClick={() => void submit()}
          >
            {action.isPending
              ? t('common.saving')
              : mode === 'cancel'
                ? notify
                  ? t('courtAction.confirmCancelNotify')
                  : t('courtAction.confirmCancel')
                : notify
                  ? t('courtAction.confirmClearNotify')
                  : t('courtAction.confirmClear')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-ca-sunken px-3 py-2 text-sm text-muted-foreground">
          {mode === 'cancel' ? t('courtAction.cancelExplain') : t('courtAction.clearExplain')}
        </p>
        <Field label={t('courtAction.reason')}>
          <FilterChips
            ariaLabel={t('courtAction.reason')}
            options={REASONS.map((r) => ({ value: r, label: t(`courtAction.reasons.${r}`) }))}
            selected={reasonKey ? [reasonKey] : []}
            onToggle={(v) => setReasonKey(v)}
          />
        </Field>
        {reasonKey === 'other' ? (
          <Field label={t('courtAction.customReason')} htmlFor="ca-reason">
            <input
              id="ca-reason"
              className={inputClass}
              value={customReason}
              maxLength={120}
              onChange={(e) => setCustomReason(e.target.value)}
              autoFocus
            />
          </Field>
        ) : null}
        <Field label={t('courtAction.note')} htmlFor="ca-note">
          <input id="ca-note" className={inputClass} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-ca-sunken px-3 py-2.5 text-sm font-medium">
          {t('courtAction.notifyHost')}
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-9 cursor-pointer accent-primary-600"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
        </label>
        {notify ? (
          <div className="space-y-1.5">
            <Field
              label={t('courtAction.message')}
              htmlFor="ca-message"
              hint={edited ? t('courtAction.messageEdited') : t('courtAction.messageAuto')}
            >
              <textarea
                id="ca-message"
                className={cx(inputClass, 'min-h-[7rem] resize-none text-sm')}
                rows={5}
                maxLength={500}
                value={message}
                onChange={(e) => {
                  setEdited(true);
                  setMessage(e.target.value);
                }}
              />
            </Field>
            {edited ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400"
                onClick={() => setEdited(false)}
              >
                <RotateCcw className="h-3 w-3" aria-hidden />
                {t('courtAction.resetMessage')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </ConsoleSheet>
  );
}
