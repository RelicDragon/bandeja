import {
  advancePlayStreak,
  getPlayStreakDeadline,
  isPlayStreakAlive,
  localDateKey,
  projectPlayStreak,
  recomputePlayStreak,
} from './playStreak';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const TZ = 'Europe/Prague';

function atLocal(ymd: string, hms = '12:00:00'): Date {
  return new Date(`${ymd}T${hms}+01:00`);
}

const empty = {
  count: 0,
  best: 0,
  lastPlayAt: null,
  weekStartAt: null,
};

{
  const play = atLocal('2026-01-06');
  const r = advancePlayStreak(empty, play, TZ);
  assert(r.count === 1 && r.advanced, 'first play → 1');
  assert(r.best === 1, 'best 1');
  assert(localDateKey(r.weekStartAt, TZ) === '2026-01-06', 'weekStart day');
}

{
  const t0 = atLocal('2026-01-06');
  const s1 = advancePlayStreak(empty, t0, TZ);
  const sameWeek = advancePlayStreak(s1, atLocal('2026-01-08'), TZ);
  assert(!sameWeek.advanced && sameWeek.count === 1, 'same week no bump');
  assert(localDateKey(sameWeek.weekStartAt, TZ) === '2026-01-06', 'weekStart fixed');
  assert(localDateKey(sameWeek.lastPlayAt, TZ) === '2026-01-08', 'lastPlay refreshed');
}

{
  const t0 = atLocal('2026-01-06');
  let s = advancePlayStreak(empty, t0, TZ);
  s = advancePlayStreak(s, atLocal('2026-01-08'), TZ);
  const nextWeek = advancePlayStreak(s, atLocal('2026-01-13'), TZ);
  assert(nextWeek.advanced && nextWeek.count === 2, 'new week while alive → +1');
  assert(nextWeek.best === 2, 'best 2');
}

{
  const t0 = atLocal('2026-01-06');
  const s1 = advancePlayStreak(empty, t0, TZ);
  const late = atLocal('2026-01-15', '00:00:01');
  assert(!isPlayStreakAlive(s1.lastPlayAt, TZ, late), 'not alive after deadline');
  const restart = advancePlayStreak(s1, late, TZ);
  assert(restart.count === 1 && restart.advanced, 'restart after break');
  assert(restart.best === 1, 'best kept at least 1');
}

{
  const t0 = atLocal('2026-01-06');
  let s = advancePlayStreak(empty, t0, TZ);
  s = advancePlayStreak(s, atLocal('2026-01-12'), TZ);
  const deadline = getPlayStreakDeadline(s.lastPlayAt, TZ);
  assert(localDateKey(deadline, TZ) === '2026-01-19', 'deadline slides with lastPlay');
  const stillAlive = advancePlayStreak(s, atLocal('2026-01-15'), TZ);
  assert(stillAlive.count === 2 && stillAlive.advanced, 'alive via extended grace + new week');
}

{
  const plays = [
    atLocal('2026-01-06'),
    atLocal('2026-01-07'),
    atLocal('2026-01-13'),
    atLocal('2026-01-20'),
  ];
  const chain = recomputePlayStreak(plays, TZ, atLocal('2026-01-21'));
  assert(chain.count === 3, `recompute count=3 got ${chain.count}`);
  assert(chain.best === 3, 'recompute best=3');
}

{
  const weekly = recomputePlayStreak(
    [atLocal('2026-01-06'), atLocal('2026-01-13'), atLocal('2026-01-20')],
    TZ,
    atLocal('2026-01-21'),
  );
  assert(weekly.count === 3, `weekly chain got ${weekly.count}`);
}

{
  const plays = [atLocal('2026-01-06'), atLocal('2026-01-13')];
  const broken = recomputePlayStreak(plays, TZ, atLocal('2026-01-25'));
  assert(broken.count === 0, 'lazy break zeros current');
  assert(broken.best === 2, 'lazy break keeps best');
}

{
  const view = projectPlayStreak(
    { count: 5, best: 8, lastPlayAt: atLocal('2026-01-06') },
    TZ,
    atLocal('2026-01-13', '10:00:00'),
    { includeAtRisk: true },
  );
  assert(view.current === 5, 'project alive current');
  assert(view.atRisk === true, 'at risk within 48h of deadline');
  assert(view.hoursLeft != null && view.hoursLeft <= 48, 'hoursLeft ≤ 48');
}

{
  const view = projectPlayStreak(
    { count: 5, best: 8, lastPlayAt: atLocal('2026-01-06') },
    TZ,
    atLocal('2026-01-13', '10:00:00'),
    { includeAtRisk: false },
  );
  assert(view.atRisk === false && view.hoursLeft === null, 'strip at-risk for others');
}

{
  const view = projectPlayStreak(
    { count: 5, best: 8, lastPlayAt: atLocal('2026-01-06') },
    TZ,
    atLocal('2026-01-15'),
    { includeAtRisk: true },
  );
  assert(view.current === 0, 'project broken current 0');
  assert(view.best === 8, 'project broken keeps best');
  assert(view.atRisk === false, 'broken not at risk');
}

console.log('playStreak: OK');
