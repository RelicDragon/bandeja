import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Zap, type LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { CityModal } from '@/components';
import { PlayHeroButton } from '@/components/home/PlayHeroButton';
import { TrainersList } from '@/components/home/TrainersList';
import { usePlayIntentContext } from '@/components/playIntent/PlayIntentContext';
import { useAuthStore } from '@/store/authStore';
import { getViewerPrimarySport } from '@/utils/profileSports';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { WelcomeGamesList } from './WelcomeGamesList';
import { useWelcomeWeekGames } from './useWelcomeWeekGames';

export type WelcomeChoice = 'play' | 'learn';

interface ChoiceCardProps {
  icon: LucideIcon;
  title: string;
  body: string;
  selected: boolean;
  tone: 'play' | 'learn';
  onClick: () => void;
  testId: string;
}

function ChoiceCard({ icon: Icon, title, body, selected, tone, onClick, testId }: ChoiceCardProps) {
  const toneClass =
    tone === 'play'
      ? selected
        ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/40'
        : 'border-emerald-500/30 bg-emerald-500/5'
      : selected
        ? 'border-sky-500 bg-sky-500/15 ring-2 ring-sky-500/40'
        : 'border-sky-500/30 bg-sky-500/5';
  const iconClass = tone === 'play' ? 'bg-emerald-500' : 'bg-sky-500';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      data-testid={testId}
      className={`flex min-h-[8.5rem] flex-col items-start gap-2 rounded-2xl border p-4 text-start shadow-sm transition-all active:scale-[0.98] ${toneClass}`}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${iconClass}`}>
        <Icon className="h-6 w-6" strokeWidth={2.5} aria-hidden />
      </span>
      <span className="text-base font-bold leading-tight text-foreground">{title}</span>
      <span className="text-xs leading-snug text-muted-foreground">{body}</span>
    </button>
  );
}

/**
 * The Welcome page's two big choices. "I want to play" opens the Play Intent
 * compose sheet (simplest path: when are you free) and lists this week's
 * novice-friendly games; "I want to learn" lists trainings and coaches.
 * Must be mounted inside a `<PlayIntentProvider>`.
 */
export function WelcomeChoices() {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const user = useAuthStore((s) => s.user);
  const primarySport = getViewerPrimarySport(user);
  const [choice, setChoice] = useState<WelcomeChoice>('play');
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const { enabled, looking, openCompose } = usePlayIntentContext();

  const noviceGames = useWelcomeWeekGames('noviceGames', choice === 'play');
  const trainings = useWelcomeWeekGames('trainings', choice === 'learn');
  const favoriteTrainerId = user?.favoriteTrainerId ?? null;
  const shownTrainings = favoriteTrainerId
    ? trainings.data?.filter((game) => game.trainerId === favoriteTrainerId)
    : trainings.data;

  const choosePlay = () => {
    setChoice('play');
    if (!user || user.cityIsSet !== true) {
      setCityModalOpen(true);
      return;
    }
    if (enabled && !looking) openCompose();
  };

  return (
    <section aria-labelledby="novice-welcome-choice-title">
      <h2
        id="novice-welcome-choice-title"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t('novice.welcome.choiceTitle')}
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <ChoiceCard
          icon={Zap}
          tone="play"
          title={t('novice.welcome.playTitle')}
          body={t('novice.welcome.playBody')}
          selected={choice === 'play'}
          onClick={choosePlay}
          testId="novice-welcome-play"
        />
        <ChoiceCard
          icon={GraduationCap}
          tone="learn"
          title={t('novice.welcome.learnTitle')}
          body={t('novice.welcome.learnBody')}
          selected={choice === 'learn'}
          onClick={() => setChoice('learn')}
          testId="novice-welcome-learn"
        />
      </div>

      <motion.div
        key={choice}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mt-4 space-y-4"
      >
        {choice === 'play' ? (
          <>
            <PlayHeroButton />
            <WelcomeGamesList
              title={t('novice.welcome.noviceGamesTitle')}
              emptyText={t('novice.welcome.noviceGamesEmpty')}
              games={noviceGames.data}
              loading={noviceGames.isPending && noviceGames.fetchStatus !== 'idle'}
              joinable
              onJoined={() => void noviceGames.refetch()}
              testId="novice-welcome-novice-games"
            />
          </>
        ) : (
          <>
            <WelcomeGamesList
              title={t('novice.welcome.trainingsTitle')}
              emptyText={t('novice.welcome.trainingsEmpty')}
              games={shownTrainings}
              loading={trainings.isPending && trainings.fetchStatus !== 'idle'}
              testId="novice-welcome-trainings"
            />
            <div className="-mx-4">
              <TrainersList show availableGames={trainings.data} levelSport={primarySport} />
            </div>
          </>
        )}
      </motion.div>

      <CityModal
        isOpen={cityModalOpen}
        onClose={() => setCityModalOpen(false)}
        onCityChanged={() => openCompose()}
      />
    </section>
  );
}
