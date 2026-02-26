import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components';
import { WelcomeQuestion } from '@/components/welcome';
import { AuthStepBar } from '@/components/auth';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';
import { getLevelColor } from '@/utils/levelColor';
import toast from 'react-hot-toast';

const QUESTIONS = ['q1', 'q2', 'q3', 'q4', 'q5'] as const;
const SLIDE_DURATION_MS = 300;
const SLIDE_COUNT = QUESTIONS.length + 1;
const STEP_TRANSITION = { duration: 0.28, ease: [0.32, 0.72, 0, 1] };
const SLIDE_OFFSET = 20;

export const WelcomeScreen = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const updateUser = useAuthStore((s) => s.updateUser);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showFinalSlide, setShowFinalSlide] = useState(false);
  const [assignedLevel, setAssignedLevel] = useState<number | null>(null);
  const [completedUser, setCompletedUser] = useState<User | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [formEnterFromRight, setFormEnterFromRight] = useState(false);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const answerList = QUESTIONS.map((_, i) => answers[i]).filter(Boolean);
  const canSubmit = answerList.length === QUESTIONS.length;
  const isIntro = currentIndex === 0;
  const isLast = currentIndex === SLIDE_COUNT - 1;
  const qIndex = currentIndex - 1;
  const hasCurrentAnswer = isIntro || answers[qIndex] != null;

  const goNext = () => {
    if (currentIndex < SLIDE_COUNT - 1) {
      setDirection(1);
      setCurrentIndex((i) => i + 1);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex((i) => i - 1);
    }
  };

  const submitWithAnswers = async (list: string[]) => {
    if (list.length !== QUESTIONS.length || list.some((a) => !a)) return;
    setSubmitting(true);
    try {
      const response = await usersApi.completeWelcomeScreen(list);
      const user = response.data;
      setAssignedLevel(typeof user?.level === 'number' ? user.level : 1);
      setCompletedUser(user);
      setShowFinalSlide(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = (index: number, opt: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [index]: opt };
      if (index === QUESTIONS.length - 1) {
        const list = QUESTIONS.map((_, i) => next[i]).filter(Boolean);
        if (list.length === QUESTIONS.length) {
          setTimeout(() => submitWithAnswers(list), SLIDE_DURATION_MS / 2);
        }
      }
      return next;
    });
    if (index < QUESTIONS.length - 1) {
      setDirection(1);
      setTimeout(() => setCurrentIndex((i) => i + 1), SLIDE_DURATION_MS / 2);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    await submitWithAnswers(answerList);
  };

  const handleGoToApp = () => {
    if (completedUser) updateUser(completedUser);
    navigate('/', { replace: true });
  };

  const handleSkip = async () => {
    setSubmitting(true);
    try {
      const response = await usersApi.skipWelcomeScreen();
      const user = response.data;
      setAssignedLevel(1);
      setCompletedUser(user);
      setShowFinalSlide(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartOver = async () => {
    try {
      const response = await usersApi.resetWelcomeScreen();
      updateUser(response.data);
      setAnswers({});
      setCurrentIndex(0);
      setFormEnterFromRight(true);
      setShowFinalSlide(false);
      setAssignedLevel(null);
      setCompletedUser(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('errors.generic'));
    }
  };

  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * SLIDE_OFFSET }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: -d * SLIDE_OFFSET }),
  };

  return (
    <AuthLayout>
      <AnimatePresence mode="wait" initial={false}>
        {showFinalSlide ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, x: SLIDE_OFFSET }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -SLIDE_OFFSET }}
            transition={STEP_TRANSITION}
            className="flex flex-col"
          >
            <style>{`
              @keyframes ringPulse {
                0%, 100% { opacity: 0.6; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.03); }
              }
              .level-ring-pulse {
                animation: ringPulse 2s ease-in-out infinite;
              }
            `}</style>
            <div className="flex flex-col items-center text-center py-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                {t('welcome.congratulationsTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-sm">
                {t('welcome.congratulationsSubtitle')}
              </p>
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-8">
                <div
                  className="level-ring-pulse absolute -inset-3 rounded-full border-4"
                  style={{ borderColor: getLevelColor(assignedLevel ?? 1, isDark).ringColor }}
                  aria-hidden
                />
                <div
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-white font-bold text-4xl sm:text-5xl tabular-nums shadow-xl"
                  style={{
                    ...getLevelColor(assignedLevel ?? 1, isDark),
                    boxShadow: '0 4px 14px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)',
                  }}
                  aria-label={String(assignedLevel)}
                >
                  <span
                    className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] drop-shadow-[0_0_8px_rgba(0,0,0,0.4)]"
                    style={{
                      WebkitTextStroke: '2px rgba(0,0,0,0.25)',
                      paintOrder: 'stroke fill',
                    }}
                  >
                    {(assignedLevel ?? 1).toFixed(1)}
                  </span>
                </div>
              </div>
              <Button onClick={handleGoToApp} className="w-full">
                {t('welcome.goToApp')}
              </Button>
              <button
                type="button"
                onClick={handleStartOver}
                className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline focus:outline-none"
              >
                {t('welcome.startOver')}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            initial={{ opacity: 0, x: formEnterFromRight ? SLIDE_OFFSET : -SLIDE_OFFSET }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -SLIDE_OFFSET }}
            transition={STEP_TRANSITION}
            onAnimationComplete={() => setFormEnterFromRight(false)}
            onSubmit={handleSubmit}
            className="flex flex-col"
          >
            <div className="overflow-hidden min-h-[120px]">
              <AnimatePresence mode="wait" initial={false} custom={direction}>
                {currentIndex === 0 ? (
                  <motion.div
                    key="intro"
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={STEP_TRANSITION}
                    className="flex flex-col items-center justify-center py-4"
                  >
                    <h2 className="text-xl sm:text-2xl font-bold text-center text-slate-800 dark:text-slate-100 mb-2">
                      {t('welcome.title')}
                    </h2>
                    <p className="text-center text-sm text-slate-600 dark:text-slate-400 max-w-sm">
                      {t('welcome.description')}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={QUESTIONS[qIndex]}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={STEP_TRANSITION}
                  >
                    <WelcomeQuestion
                      questionKey={QUESTIONS[qIndex]}
                      index={qIndex}
                      selectedOption={answers[qIndex]}
                      onSelect={(opt) => handleSelect(qIndex, opt)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-6 mb-6 shrink-0">
              <AuthStepBar steps={SLIDE_COUNT} current={currentIndex} />
            </div>

            <div className="flex gap-3 shrink-0">
              {currentIndex > 0 ? (
                <Button type="button" variant="ghost" onClick={goBack} className="shrink-0">
                  {t('welcome.back')}
                </Button>
              ) : (
                <button
                  type="button"
                  onClick={handleSkip}
                  disabled={submitting}
                  className="flex flex-col items-start text-left text-primary-600 dark:text-primary-400 hover:underline focus:outline-none disabled:opacity-50 shrink-0"
                >
                  <span className="text-sm leading-tight">{t('welcome.skip')}</span>
                  <span className="text-xs leading-tight">{t('welcome.skipSubline')}</span>
                </button>
              )}
              <div className="flex-1" />
              {!isLast ? (
                <Button
                  type="button"
                  onClick={goNext}
                  disabled={!isIntro && !hasCurrentAnswer}
                >
                  {t('welcome.next')}
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={!canSubmit || submitting}
                >
                  {submitting ? t('app.loading') : t('welcome.submit')}
                </Button>
              )}
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
};
