import { useMemo, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { Timer, Trophy } from 'lucide-react';
import { PlayerAvatarFace } from '@/components/PlayerAvatarFace';
import { AnimatedLiveBoardValue } from '@/components/liveScoring/AnimatedLiveBoardValue';
import type { LiveServeIndicator } from '@/components/liveScoring/LiveTeamPanel';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { BasicUser } from '@/types';
import type { LiveBoardTheme, LiveScoringState, LiveSetLabel, LiveTeamSide } from '@/utils/liveScoring';
import type { ScoringRules } from '@/utils/scoring';
import { watchBoardModel, type WatchPointStatus, type WatchSetColumn } from './watchBoardModel';
import { WATCH_EASE, watchBezel } from './watchTheme';

/**
 * The spectator scoreboard on `/games/:id/watch` for padel and tennis — the
 * court seen from above. Team A's names sit at the far end, team B's at the
 * near end, and both score rows face each other across the net, which carries
 * the Deuce / Advantage / Golden point / Tie-break chip. Reading order is the
 * TV board's: a column per set up to the running one, then the game points.
 *
 * Rally sports never reach this component (`useWatchBoardPlugin`).
 */
export type WatchStageProps = {
  state: LiveScoringState;
  rules: ScoringRules;
  teamAPlayers: BasicUser[];
  teamBPlayers: BasicUser[];
  boardTheme: LiveBoardTheme;
  serveIndicator?: LiveServeIndicator | null;
  matchDecided: boolean;
  timer?: string | null;
};

const PRIMARY = 'var(--member-primary-500, #0ea5e9)';
const mixPrimary = (pct: number) => `color-mix(in srgb, ${PRIMARY} ${pct}%, transparent)`;

const ACCENT_TILE: CSSProperties = {
  backgroundColor: PRIMARY,
  color: '#fff',
  boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 16px 36px -12px ${mixPrimary(85)}`,
};

type Side = { side: LiveTeamSide; players: BasicUser[] };

type StageTone = ReturnType<typeof stageTone>;

function stageTone(light: boolean) {
  return light
    ? {
        core: 'bg-white shadow-[inset_0_1px_0_rgba(255,255,255,1)]',
        line: 'bg-zinc-900/[0.07]',
        strong: 'text-zinc-950',
        soft: 'text-zinc-500',
        faint: 'text-zinc-400',
        caption: 'text-zinc-400',
        tile: 'bg-zinc-100 text-zinc-900 shadow-[inset_0_0_0_1px_rgba(24,24,27,0.05)]',
        eyebrow: 'bg-zinc-900/[0.045] text-zinc-600',
        faceRing: 'ring-white',
        net: 'text-zinc-900/25',
        netPost: 'bg-zinc-300',
        winner: 'bg-emerald-500/12 text-emerald-700',
      }
    : {
        core: 'bg-[linear-gradient(180deg,#151518_0%,#0b0b0d_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]',
        line: 'bg-white/[0.07]',
        strong: 'text-white',
        soft: 'text-zinc-400',
        faint: 'text-zinc-500',
        caption: 'text-zinc-500',
        tile: 'bg-white/[0.06] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]',
        eyebrow: 'bg-white/[0.06] text-zinc-300',
        faceRing: 'ring-[#131316]',
        net: 'text-white/30',
        netPost: 'bg-zinc-700',
        winner: 'bg-emerald-400/15 text-emerald-300',
      };
}

function setCaption(label: LiveSetLabel, t: (key: string) => string): string {
  if (label.kind === 'SUPER_TIE_BREAK') return t('gameDetails.liveScoring.superTieBreakShort');
  return String(label.setOneBased);
}

function useSetTitle(label: LiveSetLabel): string {
  const { t } = useTranslation();
  if (label.kind === 'SUPER_TIE_BREAK') return t('gameDetails.liveScoring.superTieBreakShort');
  const set = t('gameDetails.liveScoring.setN', { n: label.setOneBased });
  return label.kind === 'TIE_BREAK' ? `${set} · ${t('gameDetails.liveScoring.tieBreakShort')}` : set;
}

const STATUS_KEY: Record<WatchPointStatus, string> = {
  tieBreak: 'live.board.tieBreak',
  advantage: 'live.board.advantage',
  goldenPoint: 'live.board.goldenPoint',
  deuce: 'live.board.deuce',
};

/** A padel ball: lime felt and one seam. */
function BallGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <circle cx="8" cy="8" r="7.25" fill="#d9f99d" />
      <circle cx="8" cy="8" r="7.25" fill="url(#watch-ball-shade)" />
      <path
        d="M3.1 3.4c2.3 1.2 3.4 2.9 3.4 4.6S5.4 11.4 3.1 12.6M12.9 3.4C10.6 4.6 9.5 6.3 9.5 8s1.1 3.4 3.4 4.6"
        stroke="#fff"
        strokeOpacity="0.85"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <defs>
        <radialGradient id="watch-ball-shade" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ecfccb" stopOpacity="0" />
          <stop offset="1" stopColor="#65a30d" stopOpacity="0.55" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function Face({
  player,
  serving,
  ringClass,
  reduceMotion,
  servingLabel,
}: {
  player: BasicUser | null;
  serving: boolean;
  ringClass: string;
  reduceMotion: boolean;
  servingLabel: string;
}) {
  const initials = player ? `${player.firstName?.[0] ?? ''}${player.lastName?.[0] ?? ''}`.toUpperCase() : '';
  return (
    <div className={`relative size-12 shrink-0 rounded-full ring-[3px] ${ringClass} md:size-14`}>
      {player ? (
        <PlayerAvatarFace
          avatar={player.avatar}
          tinyUrl={null}
          initials={initials}
          alt=""
          textClassName="text-sm"
          resetKey={player.id}
        />
      ) : (
        <div className="absolute inset-0 rounded-full bg-zinc-500/20" />
      )}
      <AnimatePresence initial={false}>
        {serving ? (
          <motion.span
            key="ball"
            role="img"
            aria-label={servingLabel}
            className={`absolute -bottom-1 -end-1 size-[18px] rounded-full ring-2 ${ringClass}`}
            initial={reduceMotion ? false : { scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          >
            <BallGlyph className="size-full" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function PlayerName({ player, tone, dimmed }: { player: BasicUser | null; tone: StageTone; dimmed: boolean }) {
  const first = player?.firstName?.trim() ?? '';
  const last = player?.lastName?.trim() ?? '';
  if (!first && !last) {
    return <span className={`truncate text-[15px] font-semibold ${tone.faint}`}>—</span>;
  }
  return (
    <span className={`min-w-0 truncate text-base leading-snug md:text-lg ${dimmed ? tone.faint : ''}`}>
      {first && last ? <span className={dimmed ? '' : tone.soft}>{first} </span> : null}
      <span className={`font-semibold tracking-[-0.01em] ${dimmed ? '' : tone.strong}`}>{last || first}</span>
    </span>
  );
}

function Identity({
  players,
  serverIndex,
  tone,
  dimmed,
  isWinner,
  reduceMotion,
}: {
  players: BasicUser[];
  serverIndex: number;
  tone: StageTone;
  dimmed: boolean;
  isWinner: boolean;
  reduceMotion: boolean;
}) {
  const { t } = useTranslation();
  const roster: (BasicUser | null)[] = players.length ? players : [null];
  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <div className={`flex shrink-0 items-center transition-opacity duration-700 ${dimmed ? 'opacity-50' : ''}`}>
        {roster.map((p, i) => (
          <div key={p?.id ?? `slot-${i}`} className={i > 0 ? '-ms-3' : ''}>
            <Face
              player={p}
              serving={i === serverIndex}
              ringClass={tone.faceRing}
              reduceMotion={reduceMotion}
              servingLabel={t('live.board.serving')}
            />
          </div>
        ))}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {roster.map((p, i) => (
          <PlayerName key={p?.id ?? `slot-${i}`} player={p} tone={tone} dimmed={dimmed} />
        ))}
      </div>
      {isWinner ? (
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 font-brand text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.winner}`}
        >
          <Trophy size={12} strokeWidth={1.75} aria-hidden />
          {t('gameDetails.liveScoring.matchCompleteWinner')}
        </span>
      ) : null}
    </div>
  );
}

// Column widths shared by the caption row and both score rows, so the far and
// near numbers line up across the net.
const SET_COL = 'w-9';
const BIG_COL = 'w-[4.5rem]';
const TILE_COL = 'w-[5.25rem] md:w-[5.75rem]';
const TILE =
  'flex size-[5.25rem] items-center justify-center rounded-[1.5rem] font-brand text-[2.6rem] font-extrabold leading-none tracking-[-0.02em] tabular-nums md:size-[5.75rem] md:rounded-[1.65rem] md:text-[2.9rem]';
const BIG_NUMBER = 'font-brand text-[3.5rem] font-bold leading-none tracking-[-0.03em] tabular-nums md:text-[4rem]';
const CAPTION = 'text-center font-brand text-[10px] font-semibold uppercase tracking-[0.22em]';

/**
 * One side's numbers. `sets` are the columns before the tile: finished sets
 * small, the running set big; once the match is decided every set is big.
 */
type ScoreLine = {
  sets: WatchSetColumn[];
  /** The number on the tile at the end: game points, or the running set total in points mode. */
  tile: { caption: string; teamA: string | number; teamB: string | number; leader: LiveTeamSide | null } | null;
  bigSets: boolean;
};

function ScoreCaptions({ line, tone }: { line: ScoreLine; tone: StageTone }) {
  const { t } = useTranslation();
  return (
    <div dir="ltr" className="flex items-end">
      <div className="flex gap-1">
        {line.sets.map((col) => (
          <span
            key={col.key}
            className={`${col.active || line.bigSets ? BIG_COL : SET_COL} ${CAPTION} ${col.active ? tone.soft : tone.caption}`}
          >
            {setCaption(col.label, t)}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      {line.tile ? <span className={`${TILE_COL} ${CAPTION} ${tone.soft}`}>{line.tile.caption}</span> : null}
    </div>
  );
}

function ScoreRow({ side, line, tone }: { side: LiveTeamSide; line: ScoreLine; tone: StageTone }) {
  const tileLeads = line.tile?.leader === side;
  return (
    // Numbers read left to right in every locale, like the TV board.
    <div dir="ltr" className="flex items-center">
      <div className="flex items-baseline gap-1">
        {line.sets.map((col) => {
          const mine = side === 'teamA' ? col.teamA : col.teamB;
          const theirs = side === 'teamA' ? col.teamB : col.teamA;
          if (col.active || line.bigSets) {
            const tint = col.active || mine > theirs ? tone.strong : tone.faint;
            return (
              <span key={col.key} className={`${BIG_COL} text-center ${BIG_NUMBER} ${tint}`}>
                <AnimatedLiveBoardValue value={mine} intensity="impact" />
              </span>
            );
          }
          return (
            <span
              key={col.key}
              className={`${SET_COL} text-center font-brand text-[1.6rem] font-semibold leading-none tabular-nums ${
                mine > theirs ? tone.strong : tone.faint
              }`}
            >
              {mine}
            </span>
          );
        })}
      </div>
      <div className="min-w-3 flex-1" />
      {line.tile ? (
        <span className={`${TILE_COL} flex justify-center`}>
          <span
            className={`${TILE} transition-[background-color,color,box-shadow] duration-500 ${WATCH_EASE} ${
              tileLeads ? '' : tone.tile
            }`}
            style={tileLeads ? ACCENT_TILE : undefined}
          >
            <AnimatedLiveBoardValue value={line.tile[side]} intensity="impact" />
          </span>
        </span>
      ) : null}
    </div>
  );
}

function Net({ status, tone, reduceMotion }: { status: WatchPointStatus | null; tone: StageTone; reduceMotion: boolean }) {
  const { t } = useTranslation();
  const golden = status === 'goldenPoint';
  return (
    <div className="relative flex h-12 items-center justify-center" aria-live="polite">
      <span aria-hidden className={`absolute inset-y-0 left-1/2 w-px ${tone.line}`} />
      <span aria-hidden className={`absolute start-3 size-1.5 rounded-full ${tone.netPost}`} />
      <span aria-hidden className={`absolute end-3 size-1.5 rounded-full ${tone.netPost}`} />
      <span
        aria-hidden
        className={`absolute inset-x-5 top-1/2 h-px -translate-y-1/2 bg-[repeating-linear-gradient(90deg,currentColor_0_3px,transparent_3px_7px)] ${tone.net}`}
      />
      <AnimatePresence mode="wait" initial={false}>
        {status ? (
          <motion.span
            key={status}
            initial={reduceMotion ? false : { opacity: 0, y: 8, scale: 0.9, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.94, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
            className={`relative rounded-full px-3.5 py-1.5 font-brand text-[11px] font-bold uppercase tracking-[0.2em] ${
              golden
                ? 'bg-[linear-gradient(135deg,#fde68a,#f59e0b)] text-amber-950 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.8)]'
                : 'bg-amber-400 text-amber-950 shadow-[0_8px_24px_-10px_rgba(251,191,36,0.9)]'
            }`}
          >
            {t(STATUS_KEY[status])}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function servingIndex(side: LiveTeamSide, players: BasicUser[], serve?: LiveServeIndicator | null): number {
  if (!serve || serve.serverTeam !== side) return -1;
  if (players.length <= 1) return 0;
  return Math.min(Math.max(0, serve.serverPlayerIndex), players.length - 1);
}

const coreVariants: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.09, delayChildren: 0.18 } },
};

const halfVariants: Variants = {
  hidden: { opacity: 0, y: 18, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.8, ease: [0.32, 0.72, 0, 1] } },
};

export function WatchStage({
  state,
  rules,
  teamAPlayers,
  teamBPlayers,
  boardTheme,
  serveIndicator,
  matchDecided,
  timer,
}: WatchStageProps) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const light = boardTheme === 'light';
  const tone = stageTone(light);
  const model = useMemo(() => watchBoardModel(state, rules, matchDecided), [state, rules, matchDecided]);
  const setTitle = useSetTitle(model.activeLabel);
  const pointsMode = state.mode === 'points' && !matchDecided;

  const line = useMemo((): ScoreLine => {
    if (pointsMode) {
      // Americano: the running set total is the number to watch, so it moves onto the tile.
      const running = model.sets[model.sets.length - 1];
      return {
        sets: model.sets.slice(0, -1),
        tile: {
          caption: t('gameDetails.liveScoring.points'),
          teamA: running.teamA,
          teamB: running.teamB,
          leader: running.teamA === running.teamB ? null : running.teamA > running.teamB ? 'teamA' : 'teamB',
        },
        bigSets: false,
      };
    }
    return {
      sets: model.sets,
      tile: model.points
        ? {
            caption: model.inTieBreak ? t('gameDetails.liveScoring.tieBreakShort') : t('gameDetails.liveScoring.game'),
            ...model.points,
            leader: model.pointLeader,
          }
        : null,
      bigSets: matchDecided,
    };
  }, [pointsMode, model, matchDecided, t]);
  const leader = line.tile?.leader ?? null;

  const headline = matchDecided
    ? model.winner === 'draw'
      ? t('gameDetails.liveScoring.matchCompleteDraw')
      : t('gameDetails.liveScoring.matchComplete')
    : setTitle;

  const sides: [Side, Side] = [
    { side: 'teamA', players: teamAPlayers },
    { side: 'teamB', players: teamBPlayers },
  ];

  const half = ({ side, players }: Side, far: boolean) => {
    const dimmed = matchDecided && model.winner !== null && model.winner !== 'draw' && model.winner !== side;
    const identity = (
      <div className={`relative px-5 ${far ? 'pb-5 pt-4' : 'pb-6 pt-5'} [@media(max-height:560px)]:py-3`}>
        <Identity
          players={players}
          serverIndex={matchDecided ? -1 : servingIndex(side, players, serveIndicator)}
          tone={tone}
          dimmed={dimmed}
          isWinner={matchDecided && model.winner === side}
          reduceMotion={reduceMotion}
        />
      </div>
    );
    // The service box: the service line on the far edge, the centre line down to the net.
    const serviceBox = (
      <div
        className={`relative flex flex-1 flex-col gap-2 px-5 ${far ? 'justify-end pb-1 pt-5' : 'justify-start pb-5 pt-1'}`}
      >
        <span aria-hidden className={`absolute inset-x-0 h-px ${far ? 'top-0' : 'bottom-0'} ${tone.line}`} />
        <span aria-hidden className={`absolute inset-y-0 left-1/2 w-px ${tone.line}`} />
        {far ? <ScoreCaptions line={line} tone={tone} /> : null}
        <ScoreRow side={side} line={line} tone={tone} />
      </div>
    );
    return (
      <motion.section
        key={side}
        variants={reduceMotion ? undefined : halfVariants}
        className="relative flex flex-1 flex-col"
        data-testid={`watch-half-${side}`}
      >
        {/* The side ahead inside the running game lights its side of the net. */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 transition-opacity duration-700 ${WATCH_EASE} ${
            far ? 'top-0 -bottom-6' : '-top-6 bottom-0'
          } ${leader === side ? 'opacity-100' : 'opacity-0'}`}
          style={{
            // Centred on the net line, so the dashed net is where the light stops.
            background: `radial-gradient(120% 85% at 50% ${far ? '100%' : '0%'}, ${mixPrimary(light ? 13 : 22)}, transparent 72%)`,
          }}
        />
        {far ? identity : serviceBox}
        {far ? serviceBox : identity}
      </motion.section>
    );
  };

  return (
    <motion.div
      className={`flex max-h-[50rem] min-h-[31rem] flex-1 flex-col ${watchBezel(light).shell}`}
      initial={reduceMotion ? false : { opacity: 0, y: 28, scale: 0.98, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
      data-testid="watch-stage"
    >
      <motion.div
        className={`relative flex flex-1 flex-col overflow-hidden ${watchBezel(light).core} ${tone.core}`}
        variants={reduceMotion ? undefined : coreVariants}
        initial={reduceMotion ? false : 'hidden'}
        animate="shown"
      >
        <div className="relative flex items-center justify-between gap-3 px-5 pt-5">
          <span
            className={`inline-flex min-w-0 items-center gap-2 rounded-full px-3 py-1 font-brand text-[10px] font-semibold uppercase tracking-[0.22em] ${
              matchDecided ? tone.winner : tone.eyebrow
            }`}
          >
            <AnimatedLiveBoardValue value={headline} className="truncate" />
          </span>
          {timer ? (
            <span className={`inline-flex shrink-0 items-center gap-1.5 font-brand text-sm font-semibold tabular-nums ${tone.soft}`}>
              <Timer size={14} strokeWidth={1.5} aria-hidden />
              {timer}
            </span>
          ) : null}
        </div>

        {half(sides[0], true)}
        <Net status={model.status} tone={tone} reduceMotion={reduceMotion} />
        {half(sides[1], false)}
      </motion.div>
    </motion.div>
  );
}
