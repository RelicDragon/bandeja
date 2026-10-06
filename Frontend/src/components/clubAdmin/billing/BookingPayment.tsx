/**
 * Booking payment section — in the schedule booking detail (sheet / rail) and in the payment sheet
 * the bookings list opens. Shows the quote or the live charge (amount, paid, balance, payments),
 * and with `billing.collect`: create charge (amount prefilled from the quote), take payment
 * (amount defaults to the balance), void a payment, waive or void the charge — destructive ones
 * behind an inline confirm. All money is integer cents in the club currency.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Ban, Banknote, HandCoins, Plus, ReceiptText, Undo2 } from 'lucide-react';
import type {
  BookingBillingSummary,
  BookingItem,
  ChargeSource,
  ClubCharge,
  ClubPayment,
  ClubPaymentMethod,
} from '@shared/clubAdmin/contract';
import { parseClubAdminError } from '@/api/clubAdminErrors';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import {
  useClubChargeQuery,
  useCreateChargeMutation,
  usePatchChargeMutation,
  useRecordPaymentMutation,
  useVoidPaymentMutation,
} from '@/queries/clubAdmin';
import { ConsoleSheet } from '../console/ConsoleSheet';
import { BillingChip, Field, inputClass } from '../console/controls';
import type { ConsoleFormat } from '../console/format';
import { Skeleton } from '../console/primitives';
import { buttonClass, cx } from '../console/classes';
import { personName } from '../console/bookingText';
import { chargeSourceOf } from './billingModel';
import { CLUB_PAYMENT_METHODS, centsToInput, chargeBalanceCents, formatCents, parseMoneyInput } from './money';

type Confirm = { kind: 'waive' } | { kind: 'voidCharge' } | { kind: 'voidPayment'; payment: ClubPayment } | null;

function Line({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cx('tabular-nums text-foreground', strong ? 'font-semibold' : 'font-medium')}>{children}</dd>
    </div>
  );
}

function ConfirmBox({
  text,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  text: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation('clubAdmin');
  return (
    <div className="space-y-2 rounded-xl border border-destructive/40 bg-ca-danger-bg p-3" role="group">
      <p className="text-sm font-medium text-foreground">{text}</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={buttonClass('danger')} disabled={busy} onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className={buttonClass('ghost')} disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

export function BookingPaymentSection({
  source,
  billing,
  fmt,
  nested,
}: {
  source: ChargeSource;
  billing: BookingBillingSummary;
  fmt: ConsoleFormat;
  /** The section itself sits inside a sheet (its own sheets open nested). */
  nested?: boolean;
}) {
  const { t } = useTranslation('clubAdmin');
  const { clubId, can, context } = useClubConsole();
  const canCollect = can('billing.collect');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const chargeId = billing.chargeId ?? createdId;
  const chargeQ = useClubChargeQuery(clubId, chargeId);
  const charge: ClubCharge | null = chargeQ.data && chargeQ.data.status !== 'VOID' ? chargeQ.data : null;
  const currency = charge?.currency ?? billing.currency ?? context.club.currency;
  const money = (c: number) => formatCents(c, currency, fmt.locale);

  const [createOpen, setCreateOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const patch = usePatchChargeMutation(clubId);
  const voidPayment = useVoidPaymentMutation(clubId);

  const status = charge?.status ?? (chargeId ? billing.status : null);
  const amount = charge?.amountCents ?? billing.amountCents;
  const paid = charge?.paidCents ?? billing.paidCents;
  const balance = charge ? chargeBalanceCents(charge) : amount != null && status ? chargeBalanceCents({ amountCents: amount, paidCents: paid, status }) : 0;
  const livePayments = charge?.payments.filter((p) => !p.voidedAt) ?? [];
  const hasCharge = !!chargeId && (!chargeQ.data || chargeQ.data.status !== 'VOID');

  const runConfirm = async () => {
    if (!confirm || !chargeId) return;
    try {
      if (confirm.kind === 'voidPayment') {
        await voidPayment.mutateAsync({ chargeId, paymentId: confirm.payment.id });
        toast.success(t('billing.toast.paymentVoided'));
      } else {
        await patch.mutateAsync({ chargeId, body: { status: confirm.kind === 'waive' ? 'WAIVED' : 'VOID' } });
        if (confirm.kind === 'voidCharge') setCreatedId(null);
        toast.success(t(confirm.kind === 'waive' ? 'billing.toast.waived' : 'billing.toast.chargeVoided'));
      }
      setConfirm(null);
    } catch {
      // toasted by the mutation; keep the confirm open.
    }
  };
  const busy = patch.isPending || voidPayment.isPending;
  const titleId = useId();

  return (
    <section className="space-y-2.5" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={titleId} className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
          {t('billing.section.title')}
        </h3>
        {status ? <BillingChip billing={{ ...billing, status }} /> : null}
      </div>

      {!hasCharge ? (
        <div className="space-y-2.5 rounded-xl border border-border px-3 py-2">
          <dl>
            <Line label={t('billing.section.price')}>
              {billing.quoteCents != null ? money(billing.quoteCents) : <span className="text-muted-foreground">{t('billing.section.noPrice')}</span>}
            </Line>
          </dl>
          <p className="text-xs text-muted-foreground">{t('billing.section.noCharge')}</p>
          {canCollect ? (
            <button type="button" className={buttonClass('secondary', 'w-full')} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('billing.section.createCharge')}
            </button>
          ) : null}
        </div>
      ) : chargeQ.isPending && !charge ? (
        <Skeleton className="h-24 rounded-xl" />
      ) : (
        <div className="space-y-2.5">
          <dl className="divide-y divide-border rounded-xl border border-border px-3">
            {amount != null ? <Line label={t('billing.section.amount')}>{money(amount)}</Line> : null}
            <Line label={t('billing.section.paid')}>{money(paid)}</Line>
            {status === 'WAIVED' ? (
              <Line label={t('billing.section.balance')}>{t('billing.WAIVED')}</Line>
            ) : (
              <Line label={t('billing.section.balance')} strong>
                {money(balance)}
              </Line>
            )}
          </dl>

          {livePayments.length > 0 || (charge?.payments.length ?? 0) > 0 ? (
            <ul className="divide-y divide-border rounded-xl border border-border" aria-label={t('billing.section.payments')}>
              {charge?.payments.map((p) => (
                <li key={p.id} className={cx('flex items-center gap-3 px-3 py-2.5 text-sm', p.voidedAt && 'opacity-60')}>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block font-medium tabular-nums text-foreground', p.voidedAt && 'line-through')}>
                      {money(p.amountCents)} · {t(`billing.method.${p.method}`)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[fmt.dateTime(p.paidAt), p.payerName, personName(p.recordedBy) ? t('billing.section.by', { name: personName(p.recordedBy) }) : null, p.voidedAt ? t('billing.VOID') : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {p.note ? <span className="block truncate text-xs text-muted-foreground">{p.note}</span> : null}
                  </span>
                  {canCollect && !p.voidedAt ? (
                    <button
                      type="button"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-destructive hover:bg-ca-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                      onClick={() => setConfirm({ kind: 'voidPayment', payment: p })}
                      aria-label={t('billing.section.voidPaymentAria', { amount: money(p.amountCents) })}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      {t('billing.section.voidPayment')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {confirm ? (
            <ConfirmBox
              busy={busy}
              onCancel={() => setConfirm(null)}
              onConfirm={() => void runConfirm()}
              text={
                confirm.kind === 'voidPayment'
                  ? t('billing.confirm.voidPayment', { amount: money(confirm.payment.amountCents) })
                  : confirm.kind === 'waive'
                    ? t('billing.confirm.waive', { amount: money(balance) })
                    : t('billing.confirm.voidCharge')
              }
              confirmLabel={
                confirm.kind === 'voidPayment'
                  ? t('billing.section.voidPayment')
                  : confirm.kind === 'waive'
                    ? t('billing.section.waive')
                    : t('billing.section.voidCharge')
              }
            />
          ) : canCollect && charge ? (
            <div className="grid gap-2">
              {balance > 0 ? (
                <button type="button" className={buttonClass('primary', 'w-full')} onClick={() => setPayOpen(true)}>
                  <HandCoins className="h-4 w-4" aria-hidden />
                  {t('billing.section.takePayment')}
                </button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                {balance > 0 ? (
                  <button type="button" className={buttonClass('secondary')} onClick={() => setConfirm({ kind: 'waive' })}>
                    <ReceiptText className="h-4 w-4" aria-hidden />
                    {t('billing.section.waive')}
                  </button>
                ) : null}
                {livePayments.length === 0 ? (
                  <button
                    type="button"
                    className={buttonClass('secondary', cx('text-destructive', balance <= 0 && 'col-span-2'))}
                    onClick={() => setConfirm({ kind: 'voidCharge' })}
                  >
                    <Ban className="h-4 w-4" aria-hidden />
                    {t('billing.section.voidCharge')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {canCollect ? (
        <>
          <CreateChargeSheet
            open={createOpen}
            onOpenChange={setCreateOpen}
            nested={nested}
            source={source}
            quoteCents={billing.quoteCents}
            currency={currency}
            locale={fmt.locale}
            onCreated={(c) => {
              setCreatedId(c.id);
              setCreateOpen(false);
              toast.success(t('billing.toast.chargeCreated'));
            }}
          />
          {charge ? (
            <TakePaymentSheet
              open={payOpen}
              onOpenChange={setPayOpen}
              nested={nested}
              charge={charge}
              locale={fmt.locale}
              onDone={() => {
                setPayOpen(false);
                toast.success(t('billing.toast.paymentRecorded'));
              }}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

function MoneyInput({
  id,
  value,
  onChange,
  currency,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  currency: string;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        className={cx(inputClass, 'pe-16 text-lg font-semibold tabular-nums', invalid && 'border-destructive')}
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
      />
      <span className="pointer-events-none absolute inset-y-0 end-3.5 flex items-center text-sm font-medium text-muted-foreground">
        {currency}
      </span>
    </div>
  );
}

function CreateChargeSheet({
  open,
  onOpenChange,
  nested,
  source,
  quoteCents,
  currency,
  locale,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nested?: boolean;
  source: ChargeSource;
  quoteCents: number | null;
  currency: string;
  locale: string;
  onCreated: (c: ClubCharge) => void;
}) {
  const { t } = useTranslation('clubAdmin');
  const { clubId } = useClubConsole();
  const create = useCreateChargeMutation(clubId);
  const amountId = useId();
  const descId = useId();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount(quoteCents != null ? centsToInput(quoteCents, locale) : '');
      setDescription('');
      setTouched(false);
    }
  }
  const cents = parseMoneyInput(amount);
  const invalid = touched && cents === null;

  const submit = async () => {
    setTouched(true);
    if (cents === null) return;
    try {
      const c = await create.mutateAsync({ source, amountCents: cents, description: description.trim() || null });
      onCreated(c);
    } catch {
      // toasted (chargeExists etc.); refresh happens on settle.
    }
  };

  return (
    <ConsoleSheet
      open={open}
      onOpenChange={onOpenChange}
      nested={nested}
      modalId="club-admin-create-charge"
      title={t('billing.create.title')}
      dismissible={!create.isPending}
      footer={
        <button type="button" className={buttonClass('primary', 'w-full')} disabled={create.isPending} onClick={() => void submit()}>
          {create.isPending ? t('common.saving') : cents !== null ? t('billing.create.submitAmount', { amount: formatCents(cents, currency, locale) }) : t('billing.create.submit')}
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field
          label={t('billing.create.amount')}
          htmlFor={amountId}
          hint={quoteCents != null ? t('billing.create.fromQuote', { amount: formatCents(quoteCents, currency, locale) }) : t('billing.create.noQuote')}
          error={invalid ? t('billing.amountInvalid') : undefined}
        >
          <MoneyInput id={amountId} value={amount} onChange={setAmount} currency={currency} invalid={invalid} />
        </Field>
        <Field label={t('billing.create.description')} htmlFor={descId}>
          <input
            id={descId}
            className={inputClass}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('billing.create.descriptionPlaceholder')}
          />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1}>
          {t('billing.create.submit')}
        </button>
      </form>
    </ConsoleSheet>
  );
}

function TakePaymentSheet({
  open,
  onOpenChange,
  nested,
  charge,
  locale,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nested?: boolean;
  charge: ClubCharge;
  locale: string;
  onDone: () => void;
}) {
  const { t } = useTranslation('clubAdmin');
  const { clubId } = useClubConsole();
  const record = useRecordPaymentMutation(clubId);
  const balance = chargeBalanceCents(charge);
  const amountId = useId();
  const payerId = useId();
  const noteId = useId();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ClubPaymentMethod>('CASH');
  const [payerName, setPayerName] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount(centsToInput(balance, locale));
      setMethod('CASH');
      setPayerName('');
      setNote('');
      setTouched(false);
      setServerError(null);
    }
  }
  const money = (c: number) => formatCents(c, charge.currency, locale);
  const cents = parseMoneyInput(amount);
  const clientError =
    !touched ? null : cents === null || cents <= 0 ? t('billing.amountInvalid') : cents > balance ? t('billing.pay.exceeds', { balance: money(balance) }) : null;
  const error = clientError ?? serverError;

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    if (cents === null || cents <= 0 || cents > balance) return;
    try {
      await record.mutateAsync({
        chargeId: charge.id,
        body: { amountCents: cents, method, payerName: payerName.trim() || null, note: note.trim() || null },
      });
      onDone();
    } catch (e) {
      if (parseClubAdminError(e).suffix === 'paymentExceedsBalance') setServerError(t('billing.pay.exceedsServer'));
    }
  };

  return (
    <ConsoleSheet
      open={open}
      onOpenChange={onOpenChange}
      nested={nested}
      modalId="club-admin-take-payment"
      title={t('billing.pay.title')}
      description={t('billing.pay.balance', { amount: money(balance) })}
      dismissible={!record.isPending}
      footer={
        <button type="button" className={buttonClass('primary', 'w-full')} disabled={record.isPending} onClick={() => void submit()}>
          <Banknote className="h-4 w-4" aria-hidden />
          {record.isPending
            ? t('common.saving')
            : cents !== null && cents > 0
              ? t('billing.pay.submitAmount', { amount: money(cents) })
              : t('billing.pay.submit')}
        </button>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('billing.pay.amount')} htmlFor={amountId} error={error ?? undefined}>
          <MoneyInput
            id={amountId}
            value={amount}
            onChange={(v) => {
              setAmount(v);
              setServerError(null);
            }}
            currency={charge.currency}
            invalid={!!error}
          />
        </Field>
        <div className="space-y-1.5">
          <p id={`${amountId}-method`} className="text-[13px] font-medium text-foreground">
            {t('billing.pay.method')}
          </p>
          <div role="radiogroup" aria-labelledby={`${amountId}-method`} className="flex flex-wrap gap-2">
            {CLUB_PAYMENT_METHODS.map((m) => {
              const on = m === method;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMethod(m)}
                  className={cx(
                    'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 motion-reduce:transition-none',
                    on
                      ? 'border-primary-600 bg-primary-600 text-white dark:border-primary-400 dark:bg-primary-400 dark:text-gray-950'
                      : 'border-border bg-ca-surface text-foreground hover:bg-muted'
                  )}
                >
                  {t(`billing.method.${m}`)}
                </button>
              );
            })}
          </div>
        </div>
        <Field label={t('billing.pay.payer')} htmlFor={payerId}>
          <input
            id={payerId}
            className={inputClass}
            value={payerName}
            maxLength={120}
            autoComplete="off"
            onChange={(e) => setPayerName(e.target.value)}
            placeholder={t('billing.pay.payerPlaceholder')}
          />
        </Field>
        <Field label={t('billing.pay.note')} htmlFor={noteId}>
          <input id={noteId} className={inputClass} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1}>
          {t('billing.pay.submit')}
        </button>
      </form>
    </ConsoleSheet>
  );
}

/** Bookings-list entry: the payment section in its own sheet. */
export function BookingPaymentSheet({
  item,
  onOpenChange,
  fmt,
}: {
  item: BookingItem | null;
  onOpenChange: (o: boolean) => void;
  fmt: ConsoleFormat;
}) {
  const { t } = useTranslation('clubAdmin');
  const source = item ? chargeSourceOf(item) : null;
  return (
    <ConsoleSheet
      open={!!item && !!source && !!item.billing}
      onOpenChange={onOpenChange}
      modalId="club-admin-booking-payment"
      title={t('billing.section.title')}
      description={item ? [fmt.dateTime(item.startTime), item.courtName].filter(Boolean).join(' · ') : undefined}
    >
      {item && source && item.billing ? <BookingPaymentSection source={source} billing={item.billing} fmt={fmt} nested /> : null}
    </ConsoleSheet>
  );
}
