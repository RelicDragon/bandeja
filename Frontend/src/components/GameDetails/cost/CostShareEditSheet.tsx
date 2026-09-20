import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/Drawer';
import { OverlayKeyboardBody } from '@/components/ui/OverlayKeyboardBody';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { Button } from '@/components/Button';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import type { CostShare, PriceCurrencyLike } from './costShareTypes';
import {
  costFractionDigits,
  costMinorToMajorInput,
  formatCostMinor,
  parseCostMajorToMinor,
} from '@/features/cost/costMoney';

/**
 * PRD 348 — the organizer's **Edit share** sheet.
 *
 * It has an input, so it honours the keyboard contract (CONTRACT §7.3):
 * `DrawerContent` already carries `cap-keyboard-aware-sheet`, the body is an
 * `OverlayKeyboardBody`, and the primary action is pinned with
 * `var(--overlay-bottom-inset)`.
 *
 * The keypad is the primary way in on a phone — big, 44 px+, no OS keyboard
 * needed — but the field is a real `inputMode="decimal"` input so a hardware or
 * software keyboard, and a screen reader, work exactly as well.
 */

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function CostShareEditSheet({
  open,
  onOpenChange,
  share,
  currency,
  totalMinor,
  pending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  share: CostShare | null;
  currency: PriceCurrencyLike;
  totalMinor: number;
  pending: boolean;
  onSave: (input: { userId: string; amountMinor: number; splitRemainderEvenly: boolean }) => void;
}) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState('');
  const [splitRemainder, setSplitRemainder] = useState(true);

  useBackButtonModal(open, () => onOpenChange(false), 'cost-share-edit-sheet');

  useEffect(() => {
    if (open && share) {
      setDraft(costMinorToMajorInput(share.amountMinor, currency));
      setSplitRemainder(true);
    }
  }, [open, share, currency]);

  const decimals = costFractionDigits(currency);
  const parsed = useMemo(() => parseCostMajorToMinor(draft, currency), [draft, currency]);
  const valid = parsed != null && parsed <= totalMinor * 10;

  const name = share?.user
    ? `${share.user.firstName ?? ''} ${share.user.lastName ?? ''}`.trim()
    : '';

  const appendKey = (key: string) => {
    setDraft((previous) => {
      if (key === '.') {
        if (decimals === 0 || previous.includes('.')) return previous;
        return previous.length === 0 ? '0.' : `${previous}.`;
      }
      const next = previous === '0' ? key : `${previous}${key}`;
      const [, fraction] = next.split('.');
      if (fraction != null && fraction.length > decimals) return previous;
      return next.slice(0, 12);
    });
  };

  const handleSave = () => {
    if (!share || parsed == null) return;
    onSave({ userId: share.userId, amountMinor: parsed, splitRemainderEvenly: splitRemainder });
  };

  if (!share) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="mx-auto max-w-lg">
        <DrawerHeader className="text-start">
          <DrawerTitle>{t('cost.editShareFor', { name })}</DrawerTitle>
          <DrawerDescription>
            {t('cost.editShareHint', {
              total: formatCostMinor(totalMinor, currency, i18n.language),
            })}
          </DrawerDescription>
        </DrawerHeader>

        <OverlayKeyboardBody className="min-h-0 flex-1 overflow-y-auto px-4">
          <label className="block" htmlFor="cost-share-amount">
            <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('cost.amountLabel')}
            </span>
            <input
              id="cost-share-amount"
              value={draft}
              onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ''))}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={!valid}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-3 text-2xl font-semibold tabular-nums text-gray-900 outline-none focus:border-primary-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {parsed != null
              ? formatCostMinor(parsed, currency, i18n.language)
              : t('cost.amountInvalid')}
          </p>

          <div
            className="mt-4 grid grid-cols-3 gap-2"
            role="group"
            aria-label={t('cost.keypadLabel')}
          >
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => appendKey(key)}
                className="min-h-[52px] rounded-xl bg-gray-100 text-xl font-semibold text-gray-900 active:bg-gray-200 dark:bg-gray-800 dark:text-white dark:active:bg-gray-700"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={() => appendKey('.')}
              disabled={decimals === 0}
              className="min-h-[52px] rounded-xl bg-gray-100 text-xl font-semibold text-gray-900 disabled:opacity-40 active:bg-gray-200 dark:bg-gray-800 dark:text-white dark:active:bg-gray-700"
            >
              .
            </button>
            <button
              type="button"
              onClick={() => appendKey('0')}
              className="min-h-[52px] rounded-xl bg-gray-100 text-xl font-semibold text-gray-900 active:bg-gray-200 dark:bg-gray-800 dark:text-white dark:active:bg-gray-700"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setDraft((previous) => previous.slice(0, -1))}
              aria-label={t('cost.keypadBackspace')}
              className="inline-flex min-h-[52px] items-center justify-center rounded-xl bg-gray-100 text-gray-900 active:bg-gray-200 dark:bg-gray-800 dark:text-white dark:active:bg-gray-700"
            >
              <Delete size={20} aria-hidden />
            </button>
          </div>

          <div className="mt-4 flex min-h-[44px] items-center justify-between gap-3">
            <label htmlFor="cost-split-remainder" className="min-w-0">
              <span className="block text-sm font-medium text-gray-900 dark:text-white">
                {t('cost.splitRemainder')}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                {t('cost.splitRemainderHint')}
              </span>
            </label>
            <ToggleSwitch
              id="cost-split-remainder"
              checked={splitRemainder}
              onChange={setSplitRemainder}
            />
          </div>
        </OverlayKeyboardBody>

        <div
          className="flex gap-2 px-4 pt-3"
          style={{ paddingBottom: 'calc(var(--overlay-bottom-inset, 0px) + 1rem)' }}
        >
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t('cost.cancel')}
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={!valid || pending}>
            {t('cost.save')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
