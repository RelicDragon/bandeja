import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RangeSlider } from '@/components';
import { GameFormatGenderFields } from '@/components/gameFormat/GameFormatTeamsFields';
import type { Club, GenderTeam } from '@/types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cityId?: string | null;
  clubs: Club[];
  clubIds: string[];
  onToggleClub: (id: string) => void;
  genderTeams: GenderTeam;
  onGenderTeamsChange: (v: GenderTeam) => void;
  levelEnabled: boolean;
  onLevelEnabledChange: (v: boolean) => void;
  levelRange: [number, number];
  onLevelRangeChange: (v: [number, number]) => void;
  isBar?: boolean;
};

function scrollComposeToBottom(fromEl: HTMLElement) {
  const container = fromEl.closest('[data-play-intent-compose-scroll]') as HTMLElement | null;
  if (!container) return;
  container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
}

export function PlayIntentMoreOptionsCard({
  open,
  onOpenChange,
  cityId,
  clubs,
  clubIds,
  onToggleClub,
  genderTeams,
  onGenderTeamsChange,
  levelEnabled,
  onLevelEnabledChange,
  levelRange,
  onLevelRangeChange,
  isBar = false,
}: Props) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  const followExpandToBottom = useCallback(() => {
    if (!open) return;
    const el = rootRef.current;
    if (!el) return;
    scrollComposeToBottom(el);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="overflow-hidden rounded-xl border border-border bg-muted/30"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground/90"
      >
        <span>{t('playIntent.moreOptions')}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex"
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="more-options-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
            onUpdate={followExpandToBottom}
            onAnimationComplete={followExpandToBottom}
          >
            <div className="space-y-4 border-t border-border/70 px-3 pb-3 pt-3">
              {!isBar && (
                <GameFormatGenderFields
                  entityType="GAME"
                  genderTeams={genderTeams}
                  onGenderTeamsChange={onGenderTeamsChange}
                  genderSwitchLayoutId="playIntentComposeGender"
                />
              )}

              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('playIntent.optionalClubs')}
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {clubs.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">
                      {cityId
                        ? t('gameSubscriptions.noClubs', { defaultValue: 'No clubs' })
                        : t('gameSubscriptions.selectCityFirst', {
                            defaultValue: 'Select a city first',
                          })}
                    </p>
                  ) : (
                    clubs.map((club) => {
                      const active = clubIds.includes(club.id);
                      return (
                        <button
                          key={club.id}
                          type="button"
                          onClick={() => onToggleClub(club.id)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-background text-foreground/90 hover:bg-muted'
                          }`}
                        >
                          {club.name}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {!isBar && (
                <div>
                  <button
                    type="button"
                    aria-pressed={levelEnabled}
                    onClick={() => onLevelEnabledChange(!levelEnabled)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      levelEnabled
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-foreground'
                        : 'border-border/80 bg-background text-foreground/90 hover:bg-muted'
                    }`}
                  >
                    <span>{t('playIntent.optionalLevel')}</span>
                    <span
                      className={`text-xs font-semibold ${
                        levelEnabled
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {levelEnabled
                        ? `${levelRange[0].toFixed(1)}–${levelRange[1].toFixed(1)}`
                        : t('playIntent.anyLevel')}
                    </span>
                  </button>
                  <AnimatePresence initial={false}>
                    {levelEnabled && (
                      <motion.div
                        key="level-range"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                        className="overflow-hidden"
                        onUpdate={followExpandToBottom}
                        onAnimationComplete={followExpandToBottom}
                      >
                        <div className="pt-3">
                          <RangeSlider
                            min={1.0}
                            max={7.0}
                            value={levelRange}
                            onChange={onLevelRangeChange}
                            step={0.1}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
