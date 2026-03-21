import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { Sparkles } from 'lucide-react';
import { NameSetModal } from './NameSetModal';

export function NoNamePromptBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [openNameModal, setOpenNameModal] = useState(false);

  if (!user || user.nameIsSet === true) return null;

  const handleSaved = () => {
    setOpenNameModal(false);
  };

  return (
    <>
      <style>{`
        @keyframes welcome-cta-shine {
          0%, 100% { opacity: 0.45; transform: translateX(-30%) skewX(-12deg); }
          50% { opacity: 0.75; transform: translateX(120%) skewX(-12deg); }
        }
        .welcome-cta-shine {
          animation: welcome-cta-shine 4.5s ease-in-out infinite;
        }
      `}</style>
      <div className="mb-5 w-full min-w-0">
        <div
          className="relative overflow-hidden rounded-[1.35rem] border border-sky-200/90 bg-white/95 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset,0_8px_28px_-8px_rgba(14,165,233,0.35),0_4px_16px_-4px_rgba(15,23,42,0.08)] transition duration-300 hover:border-sky-300 hover:shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_12px_40px_-10px_rgba(14,165,233,0.45),0_8px_24px_-6px_rgba(15,23,42,0.1)] dark:border-slate-600/90 dark:bg-slate-900/95 dark:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_12px_40px_-12px_rgba(0,0,0,0.65),0_0_0_1px_rgba(56,189,248,0.12)] dark:hover:border-sky-500/40 dark:hover:shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_16px_48px_-12px_rgba(0,0,0,0.75),0_0_32px_-8px_rgba(56,189,248,0.18)]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
            style={{
              background:
                'radial-gradient(120% 80% at 0% 0%, rgba(56, 189, 248, 0.16) 0%, transparent 55%), radial-gradient(90% 70% at 100% 100%, rgba(14, 165, 233, 0.12) 0%, transparent 50%)',
            }}
          />
          <div
            className="pointer-events-none absolute -right-4 -top-12 h-36 w-36 rounded-full bg-sky-400/25 blur-3xl dark:bg-sky-500/15"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-40 rounded-full bg-cyan-300/20 blur-3xl dark:bg-cyan-500/10"
            aria-hidden
          />

          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.35rem]">
            <div
              className="welcome-cta-shine absolute -left-1/2 top-0 h-full w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent dark:via-white/[0.07]"
              aria-hidden
            />
          </div>

          <div className="relative flex flex-col gap-4 p-5 pb-2 sm:flex-row sm:items-center sm:gap-5 sm:p-6">
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[1.05rem] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white sm:text-lg">
                {t('home.noNamePromptModalTitle')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mx-0 sm:text-sm">
                {t('home.noNamePromptSubtitle')}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-center sm:items-end">
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => setOpenNameModal(true)}
                className="inline-flex items-center gap-2 animate-pulse"
              >
                <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                {t('home.noNamePromptAction')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <NameSetModal
        open={openNameModal}
        onClose={() => setOpenNameModal(false)}
        onSaved={handleSaved}
      />
    </>
  );
}
