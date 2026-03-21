import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api';
import { WelcomeQuestionnaireContent } from './WelcomeQuestionnaireContent';
import { Button, ConfirmationModal } from '@/components';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Sparkles } from 'lucide-react';

export function WelcomeQuestionnairePrompt() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [open, setOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  if (user == null || user.welcomeScreenPassed === true) return null;

  const levelLabel =
    typeof user.level === 'number' && Number.isFinite(user.level) ? user.level.toFixed(1) : '—';

  const handleDismissForever = async () => {
    setSkipLoading(true);
    try {
      const res = await usersApi.skipWelcomeScreen();
      updateUser(res.data);
      setDismissConfirmOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSkipLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes welcome-cta-shine {
          0%, 100% { opacity: 0.45; transform: translateX(-30%) skewX(-12deg); }
          50% { opacity: 0.75; transform: translateX(120%) skewX(-12deg); }
        }
        @keyframes welcome-cta-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .welcome-cta-shine {
          animation: welcome-cta-shine 4.5s ease-in-out infinite;
        }
        .welcome-cta-icon {
          animation: welcome-cta-float 3.2s ease-in-out infinite;
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
                {t('home.questionnaireCtaTitle')}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mx-0 sm:text-sm">
                {t('home.questionnaireCtaSubtitle')}
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-center sm:items-end">
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => {
                  setSessionKey((k) => k + 1);
                  setOpen(true);
                }}
                className="inline-flex items-center gap-2 animate-pulse"
              >
                <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                {t('home.questionnaireCtaAction')}
              </Button>
              <button
                type="button"
                onClick={() => setDismissConfirmOpen(true)}
                className="mt-2 text-center text-xs font-medium text-slate-500 underline decoration-slate-400/70 underline-offset-2 transition hover:text-slate-700 hover:decoration-slate-500 dark:text-slate-500 dark:decoration-slate-500/50 dark:hover:text-slate-300 sm:text-right"
              >
                {t('home.questionnaireDismissLink')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {dismissConfirmOpen && (
        <ConfirmationModal
          isOpen
          closeOnConfirm={false}
          isLoading={skipLoading}
          loadingText={t('app.loading')}
          title={t('home.questionnaireDismissTitle')}
          message={t('home.questionnaireDismissMessage', { level: levelLabel })}
          confirmText={t('home.questionnaireDismissConfirm')}
          confirmVariant="primary"
          onConfirm={handleDismissForever}
          onClose={() => !skipLoading && setDismissConfirmOpen(false)}
        />
      )}

      <Dialog open={open} onClose={() => setOpen(false)} modalId="welcome-questionnaire">
        <DialogContent className="max-w-md border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 dark:from-slate-900 dark:to-slate-950 dark:border-slate-700/90 sm:max-w-lg max-h-[min(90vh,720px)] overflow-y-auto p-6 pt-14 shadow-2xl">
          <WelcomeQuestionnaireContent
            key={sessionKey}
            onRequestClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
