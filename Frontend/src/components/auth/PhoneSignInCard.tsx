import { ArrowLeft, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FormEvent, ReactNode } from 'react';
import { Button, Input } from '@/components';

interface PhoneSignInCardProps {
  phone: string;
  password: string;
  loading: boolean;
  loadingLabel: ReactNode;
  errorSlot?: ReactNode;
  onPhoneChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onBack: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function PhoneSignInCard({
  phone,
  password,
  loading,
  loadingLabel,
  errorSlot,
  onPhoneChange,
  onPasswordChange,
  onBack,
  onSubmit,
}: PhoneSignInCardProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full space-y-4 text-slate-800 dark:text-slate-100 sm:space-y-5">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-full py-1.5 pr-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-800/90 text-white dark:bg-slate-100 dark:text-slate-900 sm:h-11 sm:w-11">
          <Phone size={20} strokeWidth={2.25} />
        </div>
      </div>

      <h2 className="font-brand text-[1.5rem] font-extrabold leading-none tracking-[-0.03em] text-slate-900 dark:text-white sm:text-[1.75rem]">
        {t('auth.legacyPhoneSignInTitle')}
      </h2>

      {errorSlot}

      <div className="space-y-3 sm:space-y-3.5">
        <Input
          label={t('auth.phone')}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+1234567890"
          required
          className="h-11 rounded-xl border-slate-200/90 bg-white/60 px-3.5 dark:border-slate-600 dark:bg-slate-800/50 sm:h-12"
        />
        <Input
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          className="h-11 rounded-xl border-slate-200/90 bg-white/60 px-3.5 dark:border-slate-600 dark:bg-slate-800/50 sm:h-12"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20 sm:h-12"
      >
        {loading ? loadingLabel : t('auth.login')}
      </Button>
    </form>
  );
}
