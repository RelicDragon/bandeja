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
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-slate-200/80 bg-white/95 p-5 text-slate-800 shadow-[0_18px_45px_rgba(15,23,42,0.10)] dark:border-slate-600/50 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-none"
    >
      <div className="flex min-h-12 items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-full py-1.5 pr-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          {t('common.back')}
        </button>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800 text-white shadow-lg shadow-slate-900/20 dark:bg-slate-100 dark:text-slate-900 dark:shadow-none">
          <Phone size={22} strokeWidth={2.25} />
        </div>
      </div>

      <div className="space-y-1.5">
        <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
          {t('auth.legacyPhoneSignIn')}
        </h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {t('auth.legacyPhoneSignInHint')}
        </p>
      </div>

      {errorSlot}

      <div className="space-y-3.5">
        <Input
          label={t('auth.phone')}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="+1234567890"
          required
          className="h-12 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 dark:border-slate-600 dark:bg-slate-800/50"
        />
        <Input
          label={t('auth.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          required
          className="h-12 rounded-xl border-slate-200 bg-slate-50/80 px-3.5 dark:border-slate-600 dark:bg-slate-800/50"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="h-12 w-full rounded-xl text-sm font-bold shadow-lg shadow-primary-600/20"
      >
        {loading ? loadingLabel : t('auth.login')}
      </Button>
    </form>
  );
}
