import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight } from 'lucide-react';
import { USER_TEAM_COLORS, type UserTeamColor } from '@shared/userTeamColors';
import { USER_TEAM_COLOR_TONES } from '@/utils/userTeamColor';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

type Props = {
  value: string | null | undefined;
  onChange: (color: UserTeamColor | null) => void;
  disabled?: boolean;
};

/** The app default follows the member's primary colour. */
const DEFAULT_SWATCH: CSSProperties = {
  backgroundImage:
    'linear-gradient(135deg, var(--member-primary-500, #0ea5e9) 50%, var(--member-primary-700, #0369a1) 50%)',
};

/** Long enough to see the check land on the new swatch before the grid folds away. */
const COLLAPSE_AFTER_PICK_MS = 280;

const EASE = [0.22, 1, 0.36, 1] as const;

function swatchStyle(key: UserTeamColor | null): CSSProperties {
  if (!key) return DEFAULT_SWATCH;
  const { light, dark } = USER_TEAM_COLOR_TONES[key];
  return { backgroundImage: `linear-gradient(135deg, ${light} 50%, ${dark} 50%)` };
}

/**
 * Team colour for a photo-less team. Collapsed it is one row — "Color · ◩ Court ›";
 * tapping it unfolds the swatches (each previews the avatar's two-tone split),
 * and picking one folds the grid back into the row. The grid is a radio group,
 * so arrow keys and screen readers work.
 */
export function UserTeamColorPicker({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const gridId = useId();
  const [expanded, setExpanded] = useState(false);
  const collapseTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    },
    [],
  );

  const selected: UserTeamColor | null = (USER_TEAM_COLORS as readonly string[]).includes(value ?? '')
    ? (value as UserTeamColor)
    : null;
  const selectedName = t(`teams.colors.${selected ?? 'default'}`);
  const options: (UserTeamColor | null)[] = [null, ...USER_TEAM_COLORS];

  const pick = (key: UserTeamColor | null) => {
    if (key !== selected) onChange(key);
    if (collapseTimer.current !== null) window.clearTimeout(collapseTimer.current);
    collapseTimer.current = window.setTimeout(
      () => {
        collapseTimer.current = null;
        setExpanded(false);
      },
      reduceMotion ? 0 : COLLAPSE_AFTER_PICK_MS,
    );
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        disabled={disabled}
        aria-expanded={expanded}
        aria-controls={gridId}
        data-testid="user-team-color-toggle"
        className="-mx-1.5 -my-1 flex w-[calc(100%+0.75rem)] items-center justify-between gap-2 rounded-xl px-1.5 py-1 text-xs outline-none transition-colors duration-150 hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:bg-white/[0.05]"
      >
        <span className="font-semibold text-zinc-800 dark:text-zinc-100">{t('teams.colorLabel')}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <motion.span
            key={selected ?? 'default'}
            className="h-4 w-4 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3),0_1px_3px_rgba(15,23,42,0.35)]"
            style={swatchStyle(selected)}
            initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 520, damping: 26 }}
            aria-hidden
          />
          <span className="truncate font-semibold text-primary-600 dark:text-primary-300">{selectedName}</span>
          <ChevronRight
            size={14}
            strokeWidth={2.5}
            className={`shrink-0 text-zinc-400 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:text-zinc-500 ${
              expanded ? 'rotate-90' : 'rtl:rotate-180'
            }`}
            aria-hidden
          />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="grid"
            id={gridId}
            className="overflow-hidden"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div
              role="radiogroup"
              aria-label={t('teams.colorLabel')}
              className="grid grid-cols-4 justify-items-center gap-x-3 gap-y-2.5 pb-0.5 pt-3"
              data-testid="user-team-color-picker"
            >
              {options.map((key, index) => {
                const isOn = key === selected;
                return (
                  <motion.button
                    key={key ?? 'default'}
                    type="button"
                    role="radio"
                    aria-checked={isOn}
                    aria-label={t(`teams.colors.${key ?? 'default'}`)}
                    disabled={disabled}
                    onClick={() => pick(key)}
                    initial={reduceMotion ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 480, damping: 24, delay: reduceMotion ? 0 : 0.04 + index * 0.025 }}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.25),0_2px_6px_-2px_rgba(15,23,42,0.45)] outline-none transition-[outline-color] duration-200 focus-visible:ring-2 focus-visible:ring-primary-500/60 active:scale-90 disabled:opacity-50 ${pressScaleGuard} ${
                      isOn ? 'outline outline-2 outline-offset-2 outline-zinc-900/75 dark:outline-white/85' : ''
                    }`}
                    style={swatchStyle(key)}
                  >
                    <AnimatePresence>
                      {isOn ? (
                        <motion.span
                          key="check"
                          initial={reduceMotion ? false : { scale: 0, rotate: -30 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                          className="flex"
                        >
                          <Check size={15} strokeWidth={3} className="text-white drop-shadow" aria-hidden />
                        </motion.span>
                      ) : null}
                    </AnimatePresence>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
