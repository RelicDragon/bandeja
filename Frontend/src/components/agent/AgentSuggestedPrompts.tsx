import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BellRing,
  CalendarDays,
  CalendarClock,
  CloudSun,
  Mail,
  PenLine,
  Search,
  Trophy,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAgentPersonalPrompts } from '@/features/agent/useAgentPersonalPrompts';
import {
  AGENT_PERSONAL_PROMPT_MAX,
  type AgentPersonalPromptKind,
} from '@/features/agent/agentPersonalPrompts';
import { AGENT_EXAMPLE_PROMPT_KEYS } from './agentExamplePrompts';

type GenericKey = (typeof AGENT_EXAMPLE_PROMPT_KEYS)[number];

interface Tone {
  icon: LucideIcon;
  /** Icon tile colors (light + dark). */
  tile: string;
}

const KIND_TONE: Record<AgentPersonalPromptKind, Tone> = {
  enterScore: { icon: PenLine, tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300' },
  needsPlayers: { icon: UserPlus, tile: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300' },
  remindPay: { icon: BellRing, tile: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300' },
  pendingInvite: { icon: Mail, tile: 'bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300' },
  payShare: { icon: Wallet, tile: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' },
  leagueNext: { icon: Trophy, tile: 'bg-yellow-50 text-yellow-600 dark:bg-yellow-500/15 dark:text-yellow-300' },
  nextGameWeather: { icon: CloudSun, tile: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300' },
};

const GENERIC_TONE: Record<GenericKey, Tone> = {
  'agent.examples.nextGames': { icon: CalendarDays, tile: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300' },
  'agent.examples.findGame': { icon: Search, tile: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300' },
  'agent.examples.moveGame': { icon: CalendarClock, tile: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300' },
  'agent.examples.league': { icon: Trophy, tile: 'bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300' },
};

/** Kinds with an `agent.personal.<kind>.context` line; the others show only the place. */
const CONTEXT_KINDS = new Set<AgentPersonalPromptKind>(['needsPlayers', 'remindPay', 'payShare', 'leagueNext']);

interface PromptCard {
  id: string;
  text: string;
  context: string | null;
  tone: Tone;
}

/**
 * Empty-state prompts (chat list without chats, a new chat): personalized cards from data the
 * app already has, topped up with the generic examples to `AGENT_PERSONAL_PROMPT_MAX`. A
 * skeleton covers only this block while the queries load (capped, see the hook).
 */
export function AgentSuggestedPrompts({
  onPick,
  disabled = false,
}: {
  onPick: (prompt: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { prompts, loading } = useAgentPersonalPrompts();

  const cards = useMemo<PromptCard[]>(() => {
    const personal = prompts.map((p): PromptCard => {
      const base = `agent.personal.${p.kind}`;
      const withDetail = CONTEXT_KINDS.has(p.kind) && !(p.kind === 'payShare' && !p.vars.name);
      const detail = withDetail ? t(`${base}.context`, p.vars) : null;
      const context = [detail, p.place].filter((s): s is string => Boolean(s && s.trim())).join(' · ');
      return { id: p.id, text: t(`${base}.prompt`, p.vars), context: context || null, tone: KIND_TONE[p.kind] };
    });
    const generic = AGENT_EXAMPLE_PROMPT_KEYS.slice(0, Math.max(0, AGENT_PERSONAL_PROMPT_MAX - personal.length)).map(
      (key): PromptCard => ({ id: key, text: t(key), context: null, tone: GENERIC_TONE[key] }),
    );
    return [...personal, ...generic];
  }, [prompts, t]);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-2" aria-busy="true" aria-label={t('agent.personal.loading')}>
        {Array.from({ length: AGENT_PERSONAL_PROMPT_MAX }, (_, i) => (
          <div
            key={i}
            className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"
          >
            <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 animate-pulse rounded bg-gray-200 dark:bg-gray-700" style={{ width: `${78 - i * 9}%` }} />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {cards.map((card, i) => {
        const Icon = card.tone.icon;
        return (
          <motion.button
            key={card.id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(card.text)}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: reduceMotion ? 0 : i * 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="group flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2.5 text-start shadow-sm shadow-gray-900/[0.02] transition-colors hover:border-primary-300 active:scale-[0.99] active:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-primary-700 dark:active:bg-gray-800"
          >
            <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${card.tone.tile}`} aria-hidden>
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span dir="auto" className="line-clamp-2 block text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                {card.text}
              </span>
              {card.context ? (
                <span dir="auto" className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                  {card.context}
                </span>
              ) : null}
            </span>
            <ArrowUpRight
              size={16}
              className="flex-shrink-0 text-gray-400 transition-colors group-hover:text-primary-500 rtl:-scale-x-100"
              aria-hidden
            />
          </motion.button>
        );
      })}
    </div>
  );
}
