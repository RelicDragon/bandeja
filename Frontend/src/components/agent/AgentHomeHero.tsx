import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { AgentComposer } from './AgentComposer';
import { AgentOrb } from './AgentOrb';

type DayPart = 'morning' | 'afternoon' | 'evening';

function dayPart(now: Date): DayPart {
  const h = now.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
}

interface AgentHomeHeroProps {
  firstName: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  /** Starts a chat with the draft as its first message. */
  onSend: () => void;
  /** Starts a chat in a voice conversation; call stays inside the tap. */
  onTalk: () => void;
  pending: boolean;
  voicePending: boolean;
}

/**
 * Top of the AI home: aurora card with the greeting, the tap-to-talk orb and the thread's own
 * composer (dictation mic, waveform = voice). Both start a new chat.
 */
export function AgentHomeHero({ firstName, draft, onDraftChange, onSend, onTalk, pending, voicePending }: AgentHomeHeroProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const part = useMemo(() => dayPart(new Date()), []);
  const name = firstName?.trim();
  const greeting = name ? t(`agent.home.greeting.${part}`, { name }) : t('agent.empty.chatTitle');

  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-3 overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-xl shadow-primary-900/[0.06] ring-1 ring-gray-900/[0.03] backdrop-blur-sm dark:border-white/[0.06] dark:bg-gray-900/70 dark:shadow-black/30 dark:ring-white/[0.04]"
    >
      <div className="agent-aurora" aria-hidden />
      <div className="relative flex items-center gap-4 px-5 pb-1 pt-5">
        <AgentOrb size={68} onTalk={onTalk} label={t('agent.voice.start')} busy={voicePending} disabled={pending} />
        <div className="min-w-0 flex-1">
          <h3 className="agent-gradient-text line-clamp-2 text-[22px] font-extrabold leading-tight tracking-tight" dir="auto">
            {greeting}
          </h3>
          <p className="mt-1 text-[13px] leading-snug text-gray-600 dark:text-gray-300">{t('agent.home.subtitle')}</p>
        </div>
      </div>
      <AgentComposer
        className="relative px-2.5 pb-2.5 pt-3"
        value={draft}
        onChange={onDraftChange}
        onSend={onSend}
        onStop={() => {}}
        onStartVoice={onTalk}
        placeholder={t('agent.home.placeholder')}
        running={false}
        disabled={pending}
      />
    </motion.section>
  );
}
