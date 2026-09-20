import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pairsApi, type PartnerEntry } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { Drawer, DrawerCloseButton, DrawerContent } from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { addOverlay } from '@/utils/urlSchema';
import type { Sport } from '@/types';
import { PartnerCard } from './PartnerCard';

export interface YourPartnersSectionProps {
  userId: string;
  sport?: Sport;
}

/** Cards shown inline before "See all" opens the full list. */
const RAIL_LIMIT = 6;

/**
 * Profile → Statistics → **Your partners**.
 *
 * A horizontal rail of partner cards ordered by win rate, with a floor of three
 * games together (below that the number is noise). Follows the
 * `FindCityEventsRail` shape: dedicated query → limited rail → `return null`
 * when there is nothing to show, so an empty profile gains no empty box.
 */
export const YourPartnersSection = ({ userId, sport }: YourPartnersSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [listOpen, setListOpen] = useState(false);

  useBackButtonModal(listOpen, () => setListOpen(false), 'pair-partners-list');

  const query = useQuery({
    queryKey: queryKeys.pairs.partners(userId, sport),
    queryFn: () => pairsApi.getPartners(userId, sport),
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
  });

  const openPair = useCallback(
    (partner: PartnerEntry) => {
      setListOpen(false);
      if (partner.teamId) {
        navigate(`/user-team/${partner.teamId}`);
        return;
      }
      navigate(addOverlay(location.pathname, location.search, 'pair', partner.pairId));
    },
    [location.pathname, location.search, navigate],
  );

  if (query.isLoading) {
    return (
      <section className="space-y-2" aria-busy="true" aria-label={t('pairs.partners.title')}>
        <div className={`${shimmerBlock} h-4 w-28 rounded`} aria-hidden />
        <div className="flex gap-2 overflow-hidden" aria-hidden>
          {[0, 1, 2].map((index) => (
            <div key={index} className={`${shimmerBlock} h-28 w-32 shrink-0 rounded-2xl`} />
          ))}
        </div>
      </section>
    );
  }

  const partners = query.data ?? [];
  if (partners.length === 0) return null;

  return (
    <section className="space-y-2" data-testid="your-partners">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('pairs.partners.title')}
        </h3>
        {partners.length > RAIL_LIMIT ? (
          <button
            type="button"
            onClick={() => setListOpen(true)}
            className="min-h-[2.75rem] shrink-0 text-xs font-semibold text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
          >
            {t('pairs.partners.seeAll')}
          </button>
        ) : null}
      </div>

      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {partners.slice(0, RAIL_LIMIT).map((partner) => (
          <li key={partner.pairId} className="shrink-0">
            <PartnerCard partner={partner} onOpen={openPair} />
          </li>
        ))}
      </ul>

      <Drawer
        open={listOpen}
        onOpenChange={(next) => {
          if (!next) setListOpen(false);
        }}
      >
        <DrawerContent
          className="flex max-h-[80dvh] flex-col overflow-hidden bg-white dark:bg-gray-900"
          accessibleTitle={t('pairs.partners.title')}
          data-testid="partners-list-sheet"
        >
          <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4">
            <h2 className="min-w-0 flex-1 text-start text-lg font-semibold text-gray-900 dark:text-white">
              {t('pairs.partners.title')}
            </h2>
            <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {partners.map((partner) => (
              <li key={partner.pairId}>
                <PartnerCard partner={partner} onOpen={openPair} layout="row" />
              </li>
            ))}
          </ul>
        </DrawerContent>
      </Drawer>
    </section>
  );
};
