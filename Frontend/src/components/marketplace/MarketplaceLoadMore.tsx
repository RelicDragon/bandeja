import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface MarketplaceLoadMoreProps {
  loading: boolean;
  onClick: () => void;
}

export function MarketplaceLoadMore({ loading, onClick }: MarketplaceLoadMoreProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();

  return (
    <div className="flex flex-col items-center gap-3">
      {loading && (
        <div
          className="flex w-full max-w-[320px] flex-wrap justify-center gap-2 [&>*]:w-[calc(50%-4px)]"
          aria-hidden
        >
          {[0, 1].map((i) => (
            <motion.div
              key={i}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={`h-24 rounded-xl ${shimmerBlock}`}
            />
          ))}
        </div>
      )}
      <Button variant="secondary" onClick={onClick} disabled={loading} className="min-w-[140px]">
        {loading ? t('common.loading', { defaultValue: 'Loading...' }) : t('marketplace.loadMore', { defaultValue: 'Load more' })}
      </Button>
    </div>
  );
}
