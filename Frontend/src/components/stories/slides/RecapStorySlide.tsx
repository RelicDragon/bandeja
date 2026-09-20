import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Building2, Flame, Handshake, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import type { StorySegment } from '@/api/stories';
import type { RecapSegmentPayload } from '@/api/recap';
import { CountUpNumber } from '@/components/ui/CountUpNumber';
import { ChemistryChip } from '@/components/pairs/ChemistryChip';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getSportConfig } from '@/sport/sportRegistry';
import {
  buildRecapCalendar,
  buildRecapSparklinePath,
  recapRingDash,
  useRecapFormatters,
} from '@/features/recap/recapFormat';
import {
  recapOwnerInitials,
  recapOwnerName,
  recapPartnerName,
  recapSlideAltText,
} from '@/features/recap/recapSlideText';
import { STORY_SLIDE_SAFE_BOTTOM } from '../storyViewerLayout';
import {
  recapSlideBackgroundClass,
  recapSlideGlowClass,
} from './recapSlideTheme';

/**
 * PRD 353 — one slide of the monthly recap reel.
 *
 * Full-bleed on a dark gradient base with exactly one accent and one hero
 * number per slide. Every animation here is gated on `usePrefersReducedMotion`
 * and shows its final state immediately when motion is reduced.
 */

const CHART_DRAW_MS = 500;
const COUNT_UP_MS = 600;

type RecapSlideProps = {
  segment: Extract<StorySegment, { sourceType: 'MONTHLY_RECAP' }>;
  /** The viewer's own id, so the partner slide can fetch pair chemistry. */
  viewerId?: string;
};

export function RecapStorySlide({ segment, viewerId }: RecapSlideProps) {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const recap = segment.recap;
  const alt = recapSlideAltText(recap, t, formatters);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      role="group"
      aria-label={alt}
    >
      <div className={`absolute inset-0 ${recapSlideBackgroundClass(recap.kind, recap.owner.isPremium)}`} />
      <div
        className={`pointer-events-none absolute -inset-x-10 top-10 h-72 rounded-full blur-3xl ${recapSlideGlowClass(
          recap.kind,
          recap.owner.isPremium,
        )}`}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" aria-hidden />

      <div
        className={`relative flex h-full min-h-0 flex-col items-center justify-center gap-5 overflow-y-auto overscroll-contain px-6 pt-32 text-center ${STORY_SLIDE_SAFE_BOTTOM}`}
      >
        <RecapSlideBody recap={recap} viewerId={viewerId} />
      </div>
    </div>
  );
}

function RecapSlideBody({ recap, viewerId }: { recap: RecapSegmentPayload; viewerId?: string }) {
  switch (recap.kind) {
    case 'COVER':
      return <RecapCoverBody recap={recap} />;
    case 'GAMES':
      return <RecapGamesBody recap={recap} />;
    case 'WINS':
      return <RecapWinsBody recap={recap} />;
    case 'LEVEL':
      return <RecapLevelBody recap={recap} />;
    case 'PARTNER':
      return <RecapPartnerBody recap={recap} viewerId={viewerId} />;
    case 'STREAK':
      return <RecapStreakBody recap={recap} />;
    case 'CLUB':
      return <RecapClubBody recap={recap} />;
    case 'LOW_ACTIVITY':
      return <RecapLowActivityBody recap={recap} />;
    case 'OUTRO':
    default:
      return <RecapOutroBody recap={recap} />;
  }
}

function RecapEyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
      {children}
    </span>
  );
}

function RecapHeadline({ children }: { children: ReactNode }) {
  return (
    <span className="block text-6xl font-extrabold leading-none text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.45)]">
      {children}
    </span>
  );
}

function RecapCaption({ children }: { children: ReactNode }) {
  return <p className="max-w-[18rem] text-base font-medium text-white/90">{children}</p>;
}

function RecapOwnerFace({ recap }: { recap: RecapSegmentPayload }) {
  return (
    <div
      className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/60 bg-white/15 text-2xl font-semibold text-white"
      aria-hidden
    >
      {recap.owner.avatar ? (
        <img src={recap.owner.avatar} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span>{recapOwnerInitials(recap)}</span>
      )}
    </div>
  );
}

function RecapSportChips({ sports }: { sports: RecapSegmentPayload['sports'] }) {
  const { t } = useTranslation();
  if (sports.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {sports.map((sport) => (
        <span
          key={sport}
          className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-white"
        >
          {t(getSportConfig(sport).labelKey)}
        </span>
      ))}
    </div>
  );
}

function RecapCoverBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const name = recapOwnerName(recap);
  return (
    <>
      <RecapOwnerFace recap={recap} />
      {name ? <RecapEyebrow>{name}</RecapEyebrow> : null}
      <RecapHeadline>{formatters.monthLong(recap.monthStart)}</RecapHeadline>
      <RecapCaption>{t('recap.slides.cover.caption')}</RecapCaption>
      <RecapSportChips sports={recap.sports} />
    </>
  );
}

function RecapGamesBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const games = recap.games;
  if (!games) return null;

  const cells = buildRecapCalendar(games);

  return (
    <>
      <RecapEyebrow>{t('recap.slides.games.eyebrow')}</RecapEyebrow>
      <RecapHeadline>
        <CountUpNumber value={games.count} durationMs={COUNT_UP_MS} />
      </RecapHeadline>
      <RecapCaption>{t('recap.slides.games.caption', { count: games.count })}</RecapCaption>
      <div className="grid w-full max-w-[16rem] grid-cols-7 gap-1.5" aria-hidden>
        {cells.map((cell, index) => (
          <motion.span
            key={`${cell.day ?? 'pad'}-${index}`}
            initial={reduceMotion || !cell.played ? false : { scale: 0.4, opacity: 0.2 }}
            animate={{ scale: 1, opacity: cell.day == null ? 0 : cell.played ? 1 : 0.28 }}
            transition={{ duration: 0.24, delay: reduceMotion ? 0 : Math.min(index * 0.012, 0.4) }}
            className={`aspect-square rounded-full ${
              cell.played ? 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]' : 'bg-white/40'
            }`}
          />
        ))}
      </div>
    </>
  );
}

function RecapWinsBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const formatters = useRecapFormatters();
  const wins = recap.wins;
  if (!wins) return null;

  const radius = 68;
  const { dash, gap } = recapRingDash(wins.winRatePct, radius);
  const circumference = dash + gap;

  return (
    <>
      <RecapEyebrow>{t('recap.slides.wins.eyebrow')}</RecapEyebrow>
      <div className="relative flex h-44 w-44 items-center justify-center">
        <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
          <circle cx="80" cy="80" r={radius} className="fill-none stroke-white/25" strokeWidth={12} />
          <motion.circle
            cx="80"
            cy="80"
            r={radius}
            className="fill-none stroke-emerald-200"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            initial={reduceMotion ? false : { strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: 0 }}
            transition={{ duration: reduceMotion ? 0 : CHART_DRAW_MS / 1000, ease: 'easeOut' }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <RecapHeadline>
            <CountUpNumber value={wins.wins} durationMs={COUNT_UP_MS} />
          </RecapHeadline>
          <span className="text-sm font-semibold text-white/85">
            {formatters.percent(wins.winRatePct)}
          </span>
        </div>
      </div>
      <RecapCaption>{t('recap.slides.wins.caption', { count: wins.wins })}</RecapCaption>
    </>
  );
}

function RecapLevelBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const formatters = useRecapFormatters();
  const level = recap.level;
  if (!level) return null;

  const path = buildRecapSparklinePath(level.points, 220, 60);
  // A month that went down is described, never judged.
  const caption =
    level.delta < 0
      ? t('recap.slides.level.neutral', { level: formatters.level(level.after) })
      : t('recap.slides.level.caption', { level: formatters.level(level.after) });

  return (
    <>
      <RecapEyebrow>{t('recap.slides.level.eyebrow')}</RecapEyebrow>
      <RecapHeadline>{formatters.levelRange(level.before, level.after)}</RecapHeadline>
      <svg viewBox="0 0 220 60" className="h-16 w-56 overflow-visible" aria-hidden>
        <motion.path
          d={path}
          className="fill-none stroke-violet-100"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduceMotion ? 0 : CHART_DRAW_MS / 1000, ease: 'easeOut' }}
        />
      </svg>
      <RecapCaption>{caption}</RecapCaption>
    </>
  );
}

function RecapPartnerBody({ recap, viewerId }: { recap: RecapSegmentPayload; viewerId?: string }) {
  const { t } = useTranslation();
  const partner = recap.partner;
  if (!partner) return null;
  const name = recapPartnerName(recap);

  return (
    <>
      <RecapEyebrow>
        <Handshake className="me-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        {t('recap.slides.partner.eyebrow')}
      </RecapEyebrow>
      <div
        className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-white/60 bg-white/15 text-2xl font-semibold text-white"
        aria-hidden
      >
        {partner.avatar ? (
          <img src={partner.avatar} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <span>{(partner.firstName?.[0] ?? '?').toUpperCase()}</span>
        )}
      </div>
      <RecapHeadline>{name}</RecapHeadline>
      <RecapCaption>
        {t('recap.slides.partner.caption', { count: partner.wins, name })}
      </RecapCaption>
      {viewerId && recap.sport ? (
        <ChemistryChip userAId={viewerId} userBId={partner.userId} sport={recap.sport} />
      ) : null}
    </>
  );
}

function RecapStreakBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const streak = recap.streak;
  if (!streak) return null;

  return (
    <>
      <RecapEyebrow>
        <Flame className="me-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        {t('recap.slides.streak.eyebrow')}
      </RecapEyebrow>
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-400/25 ring-1 ring-orange-200/60" aria-hidden>
        <Flame className="h-10 w-10 text-orange-100" strokeWidth={1.75} />
      </span>
      <RecapHeadline>
        <CountUpNumber value={streak.weeks} durationMs={COUNT_UP_MS} />
      </RecapHeadline>
      <RecapCaption>{t('recap.slides.streak.caption', { count: streak.weeks })}</RecapCaption>
      {streak.best > streak.weeks ? (
        <span className="text-sm text-white/75">
          {t('recap.slides.streak.best', { count: streak.best })}
        </span>
      ) : null}
    </>
  );
}

function RecapClubBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const club = recap.club;
  if (!club) return null;

  return (
    <>
      <RecapEyebrow>
        <Building2 className="me-1.5 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
        {t('recap.slides.club.eyebrow')}
      </RecapEyebrow>
      <div
        className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-2 border-white/60 bg-white/15 text-2xl font-semibold text-white"
        aria-hidden
      >
        {club.avatar ? (
          <img src={club.avatar} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <Building2 className="h-10 w-10" strokeWidth={1.5} />
        )}
      </div>
      <RecapHeadline>{club.name}</RecapHeadline>
      <RecapCaption>{t('recap.slides.club.caption', { count: club.games })}</RecapCaption>
    </>
  );
}

function RecapLowActivityBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const games = recap.totals?.games ?? 0;

  return (
    <>
      <RecapEyebrow>{formatters.monthLong(recap.monthStart)}</RecapEyebrow>
      <RecapHeadline>
        <CountUpNumber value={games} durationMs={COUNT_UP_MS} />
      </RecapHeadline>
      <RecapCaption>
        {t('recap.slides.lowActivity.caption', {
          count: games,
          month: formatters.monthLong(recap.monthStart),
        })}
      </RecapCaption>
      <p className="max-w-[18rem] text-sm text-white/80">
        {t('recap.slides.lowActivity.encouragement')}
      </p>
    </>
  );
}

function RecapOutroBody({ recap }: { recap: RecapSegmentPayload }) {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const Icon = recap.variant === 'LOW_ACTIVITY' ? Sparkles : Trophy;

  return (
    <>
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/40" aria-hidden>
        <Icon className="h-10 w-10 text-white" strokeWidth={1.5} />
      </span>
      <RecapHeadline>
        {t('recap.slides.outro.title', { month: formatters.nextMonthLong(recap.monthStart) })}
      </RecapHeadline>
      {recap.totals && recap.variant === 'FULL' ? (
        <RecapCaption>
          <TrendingUp className="me-1.5 inline h-4 w-4 align-[-3px]" aria-hidden />
          {/* Two counted nouns cannot share one plural family, so each half is
              its own counted key and the caption only joins them. */}
          {t('recap.slides.outro.caption', {
            games: t('recap.slides.outro.gamesPart', { count: recap.totals.games }),
            wins: t('recap.slides.outro.winsPart', { count: recap.totals.wins }),
          })}
        </RecapCaption>
      ) : (
        <RecapCaption>{t('recap.slides.outro.lowActivityCaption')}</RecapCaption>
      )}
    </>
  );
}
