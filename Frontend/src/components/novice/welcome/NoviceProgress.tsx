import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NOVICE_RANKS, noviceRankId } from '@shared/novice';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { noviceRankLabelKey } from './noviceFeatureMeta';

interface NoviceProgressRingProps {
  current: number;
  target: number;
  size?: number;
}

/** "0 / 5" ring toward Regular. */
export function NoviceProgressRing({ current, target, size = 88 }: NoviceProgressRingProps) {
  const reduceMotion = usePrefersReducedMotion();
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = target > 0 ? Math.min(1, current / target) : 0;
  const offset = circumference * (1 - fraction);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} data-testid="novice-progress-ring">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-gray-200 dark:stroke-gray-700"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          className="stroke-emerald-500"
          strokeDasharray={circumference}
          initial={reduceMotion ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: fraction === 0 ? circumference - 0.001 : offset }}
          transition={{ duration: 0.9, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold leading-none text-gray-900 dark:text-white">
          {current}
          <span className="text-sm font-semibold text-gray-400 dark:text-gray-500">/{target}</span>
        </span>
      </div>
    </div>
  );
}

/** Newcomer → … → Regular, the current rank highlighted. */
export function NoviceRankLadder({ rank }: { rank: number }) {
  const { t } = useTranslation();
  return (
    <ol
      className="flex flex-wrap items-center gap-x-1 gap-y-1.5 text-[11px] font-semibold"
      aria-label={t('novice.shell.ladderLabel')}
      data-testid="novice-rank-ladder"
    >
      {NOVICE_RANKS.map((def, index) => {
        const reached = def.rank <= rank;
        const isCurrent = def.rank === rank;
        return (
          <li key={def.id} className="flex items-center gap-1" aria-current={isCurrent ? 'step' : undefined}>
            {index > 0 ? (
              <ChevronRight
                aria-hidden
                size={12}
                strokeWidth={3}
                className={`rtl:rotate-180 ${reached ? 'text-emerald-500' : 'text-gray-300 dark:text-gray-600'}`}
              />
            ) : null}
            <span
              className={`rounded-full px-2 py-0.5 ${
                isCurrent
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : reached
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }`}
            >
              {t(noviceRankLabelKey(noviceRankId(def.rank)))}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
