import { memo, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronRight, ExternalLink, MapPin, Trophy, User as UserIcon } from 'lucide-react';
import { agentEntityKey, type AgentEntityRef } from '@shared/agentContract';
import { classifyAgentLink } from '@/features/agent/agentLinks';
import { splitAgentSlotEntities } from '@/features/agent/agentBookingCards';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import { openExternalUrl } from '@/utils/openExternalUrl';
import { formatAgentGameWhen } from './agentFormat';
import { AgentBookingCard } from './AgentBookingCard';
import { AgentSlotPicker } from './AgentSlotPicker';

const CARD =
  'flex w-full min-w-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-start transition-colors active:bg-gray-50 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60 dark:active:bg-gray-700/60';

const STATUS_CLASS: Record<string, string> = {
  ANNOUNCED: 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  STARTED: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  FINISHED: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  ARCHIVED: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
};

/** In-app path to open, or null when the card has no destination (yet). */
function entityPath(entity: AgentEntityRef): string | null {
  switch (entity.type) {
    case 'game':
    case 'league_season':
      return `/games/${entity.id}`;
    case 'club':
      return `/clubs/${entity.id}`;
    case 'user':
      return `/user-profile/${entity.id}`;
    case 'booking':
    case 'slot':
      return null;
    case 'handoff': {
      const target = classifyAgentLink(entity.url);
      return target.kind === 'internal' ? target.path : null;
    }
  }
}

export const AgentEntityCard = memo(function AgentEntityCard({ entity }: { entity: AgentEntityRef }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const timeZone = resolveViewerCityTimezone(user?.currentCity?.timezone);
  const path = entityPath(entity);
  const open = () => {
    if (path) navigate(path);
  };

  if (entity.type === 'game') {
    const when = entity.startTime ? formatAgentGameWhen(entity.startTime, settings, timeZone) : null;
    return (
      <button type="button" onClick={open} className={CARD}>
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
          <CalendarDays size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
              {entity.title || t('agent.entity.untitledGame')}
            </span>
            <span
              className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLASS[entity.status] ?? STATUS_CLASS.FINISHED}`}
            >
              {t(`agent.gameStatus.${entity.status}`, { defaultValue: entity.status })}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
            {[when, entity.clubName].filter(Boolean).join(' · ')}
          </div>
        </div>
        <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
      </button>
    );
  }

  if (entity.type === 'user') {
    return (
      <button type="button" onClick={open} className={CARD}>
        {entity.avatar ? (
          <img src={entity.avatar} alt="" className="h-10 w-10 flex-shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            <UserIcon size={20} aria-hidden />
          </div>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
          {entity.name}
        </span>
        <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
      </button>
    );
  }

  if (entity.type === 'handoff') {
    // In-app routes (`/create-game?…`, `/profile/connected-clubs`, `/clubs/:id`) go through the
    // router: on mobile the chat is its own full-screen route, so navigating leaves it and Back returns.
    const target = classifyAgentLink(entity.url);
    if (target.kind === 'blocked') return null;
    const external = target.kind === 'external';
    const onClick = () => {
      if (target.kind === 'internal') navigate(target.path);
      else void openExternalUrl(target.url);
    };
    return (
      <button type="button" onClick={onClick} className={CARD}>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-primary-600 dark:text-primary-400" dir="auto">
          {entity.label}
        </span>
        {external ? (
          <ExternalLink size={18} className="flex-shrink-0 text-gray-400" aria-hidden />
        ) : (
          <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
        )}
      </button>
    );
  }

  if (entity.type === 'booking') return <AgentBookingCard booking={entity} />;
  if (entity.type === 'slot') return <AgentSlotPicker slots={[entity]} />;

  const isClub = entity.type === 'club';
  return (
    <button type="button" onClick={open} className={CARD}>
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
        {isClub ? <MapPin size={20} aria-hidden /> : <Trophy size={20} aria-hidden />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-gray-900 dark:text-white" dir="auto">
          {isClub ? entity.name : entity.title}
        </div>
        <div className="truncate text-xs text-gray-500 dark:text-gray-400" dir="auto">
          {isClub ? (entity.cityName ?? t('agent.entity.club')) : t('agent.entity.leagueSeason')}
        </div>
      </div>
      <ChevronRight size={18} className="flex-shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
    </button>
  );
});

export const AgentEntityList = memo(function AgentEntityList({ entities }: { entities: AgentEntityRef[] }) {
  const { slots, others, slotsIndex } = useMemo(() => splitAgentSlotEntities(entities), [entities]);
  if (entities.length === 0) return null;
  const cards = others.map((e) => <AgentEntityCard key={agentEntityKey(e)} entity={e} />);
  if (slots.length > 0) cards.splice(slotsIndex, 0, <AgentSlotPicker key="slots" slots={slots} />);
  return <div className="flex flex-col gap-2">{cards}</div>;
});
