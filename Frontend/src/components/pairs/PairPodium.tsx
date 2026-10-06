import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Swords } from 'lucide-react';
import type { PairEntry } from '@/api/pairs';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { TeamAvatar } from '@/components/TeamAvatar';
import { fixedTeamUserTeamTint, UT_ACCENT_TEXT } from '@/utils/fixedTeamUserTeam';
import { PairAvatars, type PairAvatarsRing } from './PairAvatars';
import { memberDisplayName, pairDisplayName, usePairFormatters } from './pairFormat';
import { pairAvatarTeam } from './pairTeam';

export interface PairPodiumProps {
  /** Already ordered; only the first three are drawn. */
  pairs: PairEntry[];
  onOpen: (entry: PairEntry) => void;
  /** Whether the viewer can challenge this pair's user team (`pairRowChallengeState`). */
  canChallenge?: (entry: PairEntry) => boolean;
  /** Opens the challenge sheet; a sibling of the card, so it never opens the team page. */
  onChallenge?: (entry: PairEntry) => void;
}

const RINGS: PairAvatarsRing[] = ['gold', 'silver', 'bronze'];
/**
 * 1st is tallest. These are *minimum* heights sized to the content (face, two
 * identity lines, win rate, games), so a card can grow instead of clipping
 * its names; the step between places survives at 375 px.
 */
const MIN_HEIGHTS = [156, 142, 132];
const FACE_SIZES = [40, 34, 34];
/** `TeamAvatar` takes size through classes; same boxes as the pair faces. */
const TEAM_FACE_CLASS = ['!h-10 !w-10 !rounded-xl', '!h-[34px] !w-[34px] !rounded-[10px]', '!h-[34px] !w-[34px] !rounded-[10px]'];
/** Place numeral colour — same metals as the face rings. */
const RANK_TEXT = [
  'text-[#b8902a] dark:text-[#f0c860]',
  'text-[#7d8693] dark:text-[#c3ccd6]',
  'text-[#9a6236] dark:text-[#cd8f5c]',
];
const STAGGER_MS = 80;

/**
 * The top three pairs, tallest first.
 *
 * Cards are buttons and read "Number 1, Marko and Ana, 72 percent win rate,
 * 18 games". They rise into place with an 80 ms staggered spring; under
 * reduced motion they are simply there, with no stagger and no transform.
 */
export const PairPodium = memo(({ pairs, onOpen, canChallenge, onChallenge }: PairPodiumProps) => {
  const { t } = useTranslation();
  const formatters = usePairFormatters();
  const prefersReducedMotion = usePrefersReducedMotion();

  const top = pairs.slice(0, 3);
  if (top.length === 0) return null;

  return (
    <ol className="flex items-end justify-center gap-2" data-testid="pair-podium">
      {top.map((entry, index) => {
        const nameA = memberDisplayName(entry.userA);
        const nameB = memberDisplayName(entry.userB);
        const gamesLabel = t('pairs.gamesCount', { count: entry.games });
        const spokenNames = t('pairs.names.spoken', { first: nameA, second: nameB });
        const avatarTeam = pairAvatarTeam(entry);
        const teamName = entry.team?.name?.trim() || null;
        const tint = avatarTeam ? fixedTeamUserTeamTint(entry.team?.color) : null;
        const faceSize = FACE_SIZES[index]!;
        const challengeable = Boolean(onChallenge && canChallenge?.(entry));
        const rise = {
          initial: prefersReducedMotion ? false : { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: prefersReducedMotion
            ? { duration: 0 }
            : {
                type: 'spring' as const,
                stiffness: 260,
                damping: 24,
                delay: (index * STAGGER_MS) / 1000,
              },
        };

        return (
          <li key={entry.pairId} className="relative flex min-w-0 flex-1 justify-center">
            <motion.button
              type="button"
              data-testid="pair-podium-card"
              data-pair-id={entry.pairId}
              onClick={() => onOpen(entry)}
              {...rise}
              style={{
                minHeight: MIN_HEIGHTS[index],
                ...(tint && !entry.isViewerPair ? { ...tint.vars, ...tint.wash } : tint?.vars),
              }}
              className={`relative flex w-full min-w-0 flex-col items-center justify-end gap-1 rounded-2xl border px-1.5 pb-2 pt-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
                entry.isViewerPair
                  ? 'border-sky-300 bg-sky-50 dark:border-sky-500/60 dark:bg-sky-500/10'
                  : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
              }`}
              aria-label={t('pairs.aria.podium', {
                rank: formatters.count(entry.rank),
                names: teamName ? `${teamName}, ${spokenNames}` : spokenNames,
                winRate: formatters.percentNumber(entry.winRate),
                games: gamesLabel,
              })}
            >
              <span
                aria-hidden
                className={`absolute start-2 top-1 text-[11px] font-bold tabular-nums ${RANK_TEXT[index]}`}
              >
                {formatters.count(entry.rank)}
              </span>
              {avatarTeam ? (
                <TeamAvatar
                  team={avatarTeam}
                  size="tile"
                  showRing={false}
                  participantTip={false}
                  className={TEAM_FACE_CLASS[index]}
                />
              ) : (
                <PairAvatars
                  userA={entry.userA}
                  userB={entry.userB}
                  size={faceSize}
                  overlap={index === 0 ? 16 : 14}
                  ring={RINGS[index]}
                />
              )}
              {/* Two single-line rows that ellipsize sideways — never clipped vertically. */}
              <span className="flex w-full min-w-0 flex-col leading-tight" aria-hidden data-testid="pair-podium-names">
                {teamName ? (
                  <>
                    <span className={`truncate text-[12px] font-bold ${UT_ACCENT_TEXT}`}>{teamName}</span>
                    <span className="truncate text-[10px] text-gray-500 dark:text-gray-400">
                      {pairDisplayName(nameA, nameB)}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">{nameA}</span>
                    <span className="truncate text-[11px] font-medium text-gray-700 dark:text-gray-200">{nameB}</span>
                  </>
                )}
              </span>
              <span
                className="text-lg font-bold leading-none tabular-nums text-gray-900 dark:text-white"
                aria-hidden
              >
                <CountUpNumber value={entry.winRate} format={formatters.percent} />
              </span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400" aria-hidden>
                {gamesLabel}
              </span>
            </motion.button>
            {challengeable ? (
              // Sibling, not child: a button can't nest in the card button. It
              // rides the same spring and sits in the top-end corner opposite
              // the place numeral; the ::before pad makes the hit area 40 px.
              <motion.button
                type="button"
                data-testid="pair-podium-challenge"
                onClick={(event) => {
                  event.stopPropagation();
                  onChallenge?.(entry);
                }}
                aria-label={t('teams.challenge.rowAria', {
                  names: teamName ?? spokenNames,
                })}
                {...rise}
                className="absolute end-0.5 top-0.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 transition-[background-color,scale] before:absolute before:-inset-1.5 before:content-[''] hover:bg-amber-500/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 active:scale-95 dark:bg-amber-400/15 dark:text-amber-300"
              >
                <Swords size={14} strokeWidth={2.2} aria-hidden />
              </motion.button>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
});

PairPodium.displayName = 'PairPodium';
