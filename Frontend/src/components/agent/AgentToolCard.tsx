import { memo } from 'react';
import type { AgentToolCard as AgentToolCardData } from '@shared/agentContract';
import { AgentPlayIntentCard } from './AgentPlayIntentCard';
import { AgentResultsCard } from './AgentResultsCard';
import { AgentWeatherCard } from './AgentWeatherCard';

/**
 * Rich result card of a tool step or an action preview (plan §16.6 slice 9e). Unknown kinds
 * from a newer server render nothing.
 */
export const AgentToolCard = memo(function AgentToolCard({
  card,
  linkable = true,
}: {
  card: AgentToolCardData;
  /** false inside a confirmation card: deciding should not navigate away. */
  linkable?: boolean;
}) {
  switch (card.kind) {
    case 'results':
      return <AgentResultsCard card={card} linkable={linkable} />;
    case 'play_intent':
      return <AgentPlayIntentCard card={card} />;
    case 'weather':
      return <AgentWeatherCard card={card} />;
    default:
      return null;
  }
});
