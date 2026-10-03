import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Clock, Gauge, MapPin, Radar, Users, type LucideIcon } from 'lucide-react';
import type { AgentPlayIntentCard as AgentPlayIntentCardData, AgentPlayIntentChipKind } from '@shared/agentContract';
import { AgentCardPill, AgentCardShell } from './AgentCardShell';

const CHIP_ICON: Record<AgentPlayIntentChipKind, LucideIcon> = {
  days: CalendarDays,
  time: Clock,
  clubs: MapPin,
  level: Gauge,
  players: Users,
};

/** The user's open play request: when / where / level chips and how many games fit. */
export const AgentPlayIntentCard = memo(function AgentPlayIntentCard({ card }: { card: AgentPlayIntentCardData }) {
  const { t } = useTranslation();
  const matched = card.status === 'MATCHED';
  return (
    <AgentCardShell
      icon={<Radar size={20} aria-hidden />}
      iconClassName="bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400"
      title={card.lookingFor}
      subtitle={card.cityName}
      pill={
        <AgentCardPill tone={matched ? 'warn' : 'good'}>
          {t(matched ? 'agent.cards.playIntent.matched' : 'agent.cards.playIntent.open')}
        </AgentCardPill>
      }
    >
      <ul className="flex flex-wrap gap-1.5">
        {card.chips.map((chip) => {
          const Icon = CHIP_ICON[chip.kind];
          return (
            <li
              key={chip.kind}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700 dark:bg-gray-700/70 dark:text-gray-200"
            >
              <Icon size={12} className="flex-shrink-0 text-gray-500 dark:text-gray-400" aria-label={t(`agent.cards.playIntent.chip.${chip.kind}`)} />
              <span className="truncate" dir="auto">
                {chip.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {card.proposal
          ? t('agent.cards.playIntent.inProposal', { count: card.proposal.memberCount })
          : card.matchingGameCount > 0
            ? t('agent.cards.playIntent.gamesFit', { count: card.matchingGameCount })
            : t('agent.cards.playIntent.noGames')}
      </p>
    </AgentCardShell>
  );
});
