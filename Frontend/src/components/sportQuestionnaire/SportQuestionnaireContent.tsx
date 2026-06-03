import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Button } from '@/components';
import { AuthStepBar } from '@/components/auth';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import type { Sport, User } from '@/types';
import { getLevelColor } from '@/utils/levelColor';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportQuestionnaireConfig } from '@/sport/sportQuestionnaireRegistry';
import { getDisplayLevelForSport } from '@/utils/profileSports';
import { SportProfileLevelMeta } from '@/components/profile/SportProfileLevelMeta';
import { SportQuestionnaireQuestion } from './SportQuestionnaireQuestion';

const SLIDE_DURATION_MS = 300;
const SLIDE_OFFSET = 20;
const STEP_TRANSITION = { duration: 0.28, ease: [0.32, 0.72, 0, 1] as const };

export type SportQuestionnaireContentProps = {
  sport: Sport;
  onRequestClose: () => void;
  onCompleted?: (user: User) => void;
  showPadelStartOver?: boolean;
};

export function SportQuestionnaireContent({
  sport,
  onRequestClose,
  onCompleted,
  showPadelStartOver = sport === 'PADEL',
}: SportQuestionnaireContentProps) {
  const { t } = useTranslation();
  const updateUser = useAuthStore((s) => s.updateUser);
  const config = getSportQuestionnaireConfig(sport);
  const questions = config?.questionKeys ?? [];
  const slideCount = questions.length + 1;
  const sportLabel = t(getSportConfig(sport).labelKey);

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

  if (!config || questions.length === 0) {
    return null;
  }

  const answerList = questions.map((_, i) => answers[i]).filter(Boolean);
  const canSubmit = answerList.length === questions.length;
  const isIntro = currentIndex === 0;
  const isLast = currentIndex === slideCount - 1;
  const qIndex = currentIndex - 1;
  const hasCurrentAnswer = isIntro || answers[qIndex] != null;

  const goNext = () => {
    if (currentIndex < slideCount - 1) {
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

  const resolveLevelFromUser = (user: User): number => getDisplayLevelForSport(user, sport);

  const submitWithAnswers = async (list: string[]) => {
    if (list.length !== questions.length || list.some((a) => !a)) return;
    setSubmitting(true);
    try {
      const response =
        sport === 'PADEL'
          ? await usersApi.completeWelcomeScreen(list)
          : await usersApi.completeSportQuestionnaire(sport, list);
      const user = response.data;
      setAssignedLevel(resolveLevelFromUser(user));
      setCompletedUser(user);
      setShowFinalSlide(true);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelect = (index: number, opt: string) => {
    setAnswers((prev) => {
      const next = { ...prev, [index]: opt };
      if (index === questions.length - 1) {
        const list = questions.map((_, i) => next[i]).filter(Boolean);
        if (list.length === questions.length) {
          setTimeout(() => submitWithAnswers(list), SLIDE_DURATION_MS / 2);
        }
      }
      return next;
    });
    if (index < questions.length - 1) {
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
    if (completedUser) {
      updateUser(completedUser);
      onCompleted?.(completedUser);
    }
    onRequestClose();
  };

  const handleStartOver = async () => {
    if (sport !== 'PADEL') return;
    try {
      const response = await usersApi.resetWelcomeScreen();
      updateUser(response.data);
      setAnswers({});
      setCurrentIndex(0);
      setFormEnterFromRight(true);
      setShowFinalSlide(false);
      setAssignedLevel(null);
      setCompletedUser(null);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(message);
    }
  };

  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, x: d * SLIDE_OFFSET }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: -d * SLIDE_OFFSET }),
  };

  return (
    <QuestionnaireShell className="flex flex-col min-w-0">
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
            <div className="flex flex-col items-center text-center py-4">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">
                {t('sportQuestionnaire.common.congratulationsTitle')}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-sm">
                {t('sportQuestionnaire.common.congratulationsSubtitle', { sport: sportLabel })}
              </p>
              <div className="relative w-28 h-28 sm:w-32 sm:h-32 mb-8">
                <div
                  className="level-ring-pulse absolute -inset-3 rounded-full border-4"
                  style={{ borderColor: getLevelColor(assignedLevel ?? 1, isDark).ringColor }}
                  aria-hidden
                />
                <LevelResultBadge level={assignedLevel ?? 1} isDark={isDark} />
              </div>
              {completedUser && assignedLevel != null && (
                <SportProfileLevelMeta
                  user={completedUser}
                  sport={sport}
                  level={assignedLevel}
                  className="mb-4 max-w-xs"
                />
              )}
              <Button onClick={handleGoToApp} className="w-full">
                {t('sportQuestionnaire.common.goToApp')}
              </Button>
              {showPadelStartOver && (
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="mt-4 text-sm text-primary-600 dark:text-primary-400 hover:underline focus:outline-none"
                >
                  {t('welcome.startOver')}
                </button>
              )}
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
                      {t('sportQuestionnaire.common.title', { sport: sportLabel })}
                    </h2>
                    <p className="text-center text-sm text-slate-600 dark:text-slate-400 max-w-sm">
                      {t('sportQuestionnaire.common.description', { sport: sportLabel })}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={questions[qIndex]}
                    custom={direction}
                    variants={stepVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={STEP_TRANSITION}
                  >
                    <SportQuestionnaireQuestion
                      sport={sport}
                      questionKey={questions[qIndex]}
                      index={qIndex}
                      selectedOption={answers[qIndex]}
                      onSelect={(opt) => handleSelect(qIndex, opt)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <p className="mt-2 text-[11px] text-center text-slate-500 dark:text-slate-500">
              {t('sportQuestionnaire.common.disclaimer')}
            </p>

            <QuestionnaireStepBar slideCount={slideCount} currentIndex={currentIndex} />

            <QuestionnaireFormFooter
              currentIndex={currentIndex}
              submitting={submitting}
              isIntro={isIntro}
              isLast={isLast}
              hasCurrentAnswer={hasCurrentAnswer}
              canSubmit={canSubmit}
              onBack={goBack}
              onLater={onRequestClose}
              onNext={goNext}
              t={t}
            />
          </motion.form>
        )}
      </AnimatePresence>
    </QuestionnaireShell>
  );
}

function QuestionnaireShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={className}>{children}</div>;
}

function LevelResultBadge({ level, isDark }: { level: number; isDark: boolean }) {
  return (
    <div
      className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-white font-bold text-4xl sm:text-5xl tabular-nums shadow-xl"
      style={{
        ...getLevelColor(level, isDark),
        boxShadow: '0 4px 14px rgba(0,0,0,0.25), 0 8px 24px rgba(0,0,0,0.15)',
      }}
      aria-label={String(level)}
    >
      <span
        className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] drop-shadow-[0_0_8px_rgba(0,0,0,0.4)]"
        style={{
          WebkitTextStroke: '2px rgba(0,0,0,0.25)',
          paintOrder: 'stroke fill',
        }}
      >
        {level.toFixed(1)}
      </span>
    </div>
  );
}

function QuestionnaireStepBar({
  slideCount,
  currentIndex,
}: {
  slideCount: number;
  currentIndex: number;
}) {
  return (
    <div className="mt-4 mb-6 shrink-0">
      <AuthStepBar steps={slideCount} current={currentIndex} />
    </div>
  );
}

function QuestionnaireFormFooter({
  currentIndex,
  submitting,
  isIntro,
  isLast,
  hasCurrentAnswer,
  canSubmit,
  onBack,
  onLater,
  onNext,
  t,
}: {
  currentIndex: number;
  submitting: boolean;
  isIntro: boolean;
  isLast: boolean;
  hasCurrentAnswer: boolean;
  canSubmit: boolean;
  onBack: () => void;
  onLater: () => void;
  onNext: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex gap-3 shrink-0">
      {currentIndex > 0 ? (
        <Button type="button" variant="ghost" onClick={onBack} className="shrink-0">
          {t('sportQuestionnaire.common.back')}
        </Button>
      ) : (
        <button
          type="button"
          onClick={onLater}
          disabled={submitting}
          className="text-sm text-left text-primary-600 dark:text-primary-400 hover:underline focus:outline-none disabled:opacity-50 shrink-0"
        >
          {t('sportQuestionnaire.common.fillItLater')}
        </button>
      )}
      <div className="flex-1" />
      {!isLast ? (
        <Button type="button" onClick={onNext} disabled={!isIntro && !hasCurrentAnswer}>
          {t('sportQuestionnaire.common.next')}
        </Button>
      ) : (
        <Button type="submit" disabled={!canSubmit || submitting}>
          {submitting ? t('app.loading') : t('sportQuestionnaire.common.submit')}
        </Button>
      )}
    </div>
  );
}
