/**
 * `/my-clubs/:clubId/club` — the Club area hub: one row per settings screen the role may open.
 * Profile/hours open the club settings screen, courts/pricing the courts screen, until their
 * dedicated screens ship.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Eye, Image, LayoutGrid, MessageSquareText, ScrollText, Tag, Users, type LucideIcon } from 'lucide-react';
import { ClubViewAsPlayerModal } from '@/components/clubAdmin/ClubViewAsPlayerModal';
import { AttentionRow, RowList, Section } from '@/components/clubAdmin/console/primitives';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useConsoleHeader } from '@/clubAdmin/consoleChrome';
import { consoleBase, visibleClubPages, type ClubPageId } from '@/clubAdmin/consoleNav';
import { SetupChecklistCard } from '@/components/clubAdmin/today/SetupChecklistCard';

const PAGE_ICON: Record<ClubPageId, LucideIcon> = {
  profile: Image,
  hours: Clock,
  courts: LayoutGrid,
  pricing: Tag,
  team: Users,
  activity: ScrollText,
  reviews: MessageSquareText,
};

export function ClubHubPage() {
  const { t } = useTranslation('clubAdmin');
  const { clubId, context } = useClubConsole();
  const [viewAsPlayer, setViewAsPlayer] = useState(false);
  useConsoleHeader({ title: t('nav.club') });
  const pages = visibleClubPages(context.capabilities);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4 pb-8 lg:p-6">
      <SetupChecklistCard />
      {pages.length > 0 ? (
        <Section title={t('club.settingsTitle')}>
          <RowList>
            {pages.map((p) => (
              <AttentionRow
                key={p.id}
                icon={PAGE_ICON[p.id]}
                tone="info"
                title={t(`club.pages.${p.id}.title`)}
                description={t(`club.pages.${p.id}.description`)}
                to={`${consoleBase(clubId)}/club/${p.id}`}
              />
            ))}
          </RowList>
        </Section>
      ) : null}
      <Section title={t('club.publicTitle')}>
        <RowList>
          <AttentionRow
            icon={Eye}
            tone="info"
            title={t('club.viewAsPlayer')}
            description={t('club.viewAsPlayerHint')}
            onClick={() => setViewAsPlayer(true)}
          />
        </RowList>
      </Section>
      <ClubViewAsPlayerModal clubId={clubId} open={viewAsPlayer} onClose={() => setViewAsPlayer(false)} />
    </div>
  );
}
