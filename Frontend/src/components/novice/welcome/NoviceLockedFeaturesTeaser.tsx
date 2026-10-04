import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NOVICE_FEATURE_MIN_RANK, noviceRankId } from '@shared/novice';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  NOVICE_FEATURE_ICONS,
  NOVICE_TEASER_FEATURES,
  noviceFeatureLabelKey,
  noviceRankLabelKey,
} from './noviceFeatureMeta';

/**
 * Welcome page teaser: the app's bigger features as locked tiles that pop in
 * one after another, each with the rank that reveals it. Static under
 * prefers-reduced-motion.
 */
export function NoviceLockedFeaturesTeaser() {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <section aria-labelledby="novice-teaser-title" data-testid="novice-teaser">
      <h2
        id="novice-teaser-title"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {t('novice.welcome.teaserTitle')}
      </h2>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {NOVICE_TEASER_FEATURES.map((feature, index) => {
          const Icon = NOVICE_FEATURE_ICONS[feature];
          const rankLabel = t(noviceRankLabelKey(noviceRankId(NOVICE_FEATURE_MIN_RANK[feature])));
          return (
            <motion.li
              key={feature}
              initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.85 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 * index }}
              className="relative flex flex-col items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-2 py-3 text-center shadow-sm dark:bg-gray-900"
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Icon size={20} aria-hidden />
                <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-white ring-2 ring-white dark:bg-gray-100 dark:text-gray-900 dark:ring-gray-900">
                  <Lock size={9} strokeWidth={3} aria-hidden />
                </span>
              </span>
              <span className="line-clamp-2 text-xs font-semibold leading-tight text-foreground">
                {t(noviceFeatureLabelKey(feature))}
              </span>
              <span className="text-[10px] font-medium leading-none text-muted-foreground">{rankLabel}</span>
            </motion.li>
          );
        })}
        <motion.li
          initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.3, delay: 0.05 * NOVICE_TEASER_FEATURES.length }}
          className="flex items-center justify-center rounded-2xl border border-dashed border-border px-2 py-3 text-center text-xs font-semibold text-muted-foreground"
        >
          {t('novice.welcome.teaserMore')}
        </motion.li>
      </ul>
    </section>
  );
}
