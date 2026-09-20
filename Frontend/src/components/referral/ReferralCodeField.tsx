import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { referralApi } from '@/api/referral';
import {
  formatReferralCodeInput,
  REFERRAL_CODE_VALIDATE_DEBOUNCE_MS,
} from '@/features/referral/referralCode';
import {
  referralCodeErrorKey,
  validateReferralCodeInput,
} from '@/features/referral/referralCodeValidation';
import { useSubmitReferralCode } from '@/features/referral/useReferral';
import { captureManualReferralCode } from '@/utils/appAttribution';
import { ReferrerAvatar } from '@/components/referral/ReferrerAvatar';

export interface ReferralCodeFieldProps {
  /**
   * `signup` runs before an account exists: a valid code is stored in the
   * attribution snapshot and attaches itself when the register request goes
   * out. `account` posts to `/referrals/me/code` straight away.
   */
  mode: 'signup' | 'account';
  /** The viewer's own code, so "you can't use your own code" is instant. */
  ownCode?: string | null;
  onAccepted?: (referrer: { firstName: string | null; avatar: string | null }) => void;
  className?: string;
}

/**
 * PRD 351 — the "Have a code?" input.
 *
 * Uppercases and inserts the dash as the user types, then validates against
 * the public resolver 300 ms after they stop. A resolved code shows the
 * referrer's name and a green check; an unresolvable one shows a field error.
 */
export const ReferralCodeField = ({
  mode,
  ownCode,
  onAccepted,
  className = '',
}: ReferralCodeFieldProps) => {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [checking, setChecking] = useState(false);
  const [resolved, setResolved] = useState<{ firstName: string | null; avatar: string | null } | null>(
    null,
  );
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submitCode = useSubmitReferralCode();

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const runCheck = useCallback(
    async (code: string) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setChecking(true);
      try {
        const referrer = await referralApi.resolvePublic(code);
        // A slower earlier request must never overwrite a newer answer.
        if (requestIdRef.current !== requestId) return;
        if (!referrer.found) {
          setResolved(null);
          setErrorKey('referral.errors.invalidCode');
          return;
        }
        setErrorKey(null);
        if (mode === 'signup') {
          captureManualReferralCode(code);
          setResolved({ firstName: referrer.firstName, avatar: referrer.avatar });
          onAccepted?.({ firstName: referrer.firstName, avatar: referrer.avatar });
          return;
        }
        const result = await submitCode.mutateAsync(code);
        if (requestIdRef.current !== requestId) return;
        setResolved(result.referrer);
        onAccepted?.(result.referrer);
      } catch (error) {
        if (requestIdRef.current !== requestId) return;
        setResolved(null);
        const message = (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        setErrorKey(message && message.startsWith('referral.') ? message : 'referral.errors.invalidCode');
      } finally {
        if (requestIdRef.current === requestId) setChecking(false);
      }
    },
    [mode, onAccepted, submitCode],
  );

  const handleChange = useCallback(
    (raw: string) => {
      const formatted = formatReferralCodeInput(raw);
      setValue(formatted);
      setResolved(null);
      if (timerRef.current) clearTimeout(timerRef.current);

      const local = validateReferralCodeInput(formatted, ownCode);
      setErrorKey(referralCodeErrorKey(local.status));
      if (local.status !== 'ready' || !local.code) {
        setChecking(false);
        requestIdRef.current += 1;
        return;
      }
      const code = local.code;
      timerRef.current = setTimeout(() => {
        void runCheck(code);
      }, REFERRAL_CODE_VALIDATE_DEBOUNCE_MS);
    },
    [ownCode, runCheck],
  );

  const errorText = errorKey ? t(errorKey) : null;
  const referrerName = resolved?.firstName?.trim() || t('referral.aFriend');

  return (
    <div className={className}>
      <label
        htmlFor="referral-code-input"
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {t('referral.codeFieldLabel')}
      </label>
      <div className="relative">
        <input
          id="referral-code-input"
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="BNDJ-7K2Q"
          aria-invalid={Boolean(errorText)}
          aria-describedby="referral-code-feedback"
          className={`min-h-[44px] w-full rounded-lg border bg-gray-50/70 px-3 py-2 font-mono text-sm uppercase tracking-[0.18em] text-gray-800 transition-all duration-200 placeholder:tracking-normal placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:bg-gray-800/40 dark:text-gray-200 dark:focus:ring-primary-400/20 ${
            errorText
              ? 'border-red-400 dark:border-red-500'
              : resolved
                ? 'border-green-500 dark:border-green-400'
                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
          }`}
          style={{ paddingInlineEnd: '2.5rem' }}
        />
        <span
          className="pointer-events-none absolute inset-y-0 flex items-center"
          style={{ insetInlineEnd: '0.75rem' }}
          aria-hidden
        >
          {checking ? (
            <Loader2 size={18} className="animate-spin text-gray-400" />
          ) : resolved ? (
            <Check size={18} className="text-green-600 dark:text-green-400" />
          ) : null}
        </span>
      </div>

      <div id="referral-code-feedback" aria-live="polite" className="mt-1.5">
        {errorText && <p className="text-sm text-red-500 dark:text-red-400">{errorText}</p>}
        {!errorText && resolved && (
          <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
            <ReferrerAvatar firstName={resolved.firstName} avatar={resolved.avatar} size={24} />
            <span>{t('referral.codeAccepted', { name: referrerName })}</span>
          </p>
        )}
        {!errorText && !resolved && checking && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('referral.codeChecking')}</p>
        )}
      </div>
    </div>
  );
};
