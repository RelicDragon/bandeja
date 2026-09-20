/**
 * PRD 357 — pure severity classification and outdoor detection.
 *
 * No database, no clock, no network. The last block is a **source scan** of
 * `services/weather/`, which is the durable form of the product principle:
 * a future refactor that lets an unknown-court game alert, or that stops
 * requiring a severity rise for the second alert, fails here instead of
 * quietly turning the feature into spam.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  alertWindowBounds,
  classifyWeatherRisk,
  decideAlert,
  detectOutdoor,
  evaluateGameWeather,
  isAlertableSeverity,
  isInAlertWindow,
  nextWeatherAlertState,
  parseWeatherAlertState,
  severityRose,
  WEATHER_RISK_HEAVY_POP_THRESHOLD,
  WEATHER_RISK_POP_THRESHOLD,
  WEATHER_RISK_PRECIP_MM_THRESHOLD,
  WEATHER_RISK_WIND_KPH_THRESHOLD,
  type WeatherAlertState,
  type WeatherRiskHour,
} from './weatherRisk';

const T0 = '2026-09-21T17:00:00.000Z';
const T1 = '2026-09-21T18:00:00.000Z';
const T2 = '2026-09-21T19:00:00.000Z';

function hour(overrides: Partial<WeatherRiskHour> = {}): WeatherRiskHour {
  return {
    time: T0,
    precipitationProbability: 0,
    precipitationMm: 0,
    windSpeedKmh: 5,
    conditionKey: 'clear',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

assert.equal(classifyWeatherRisk([]).severity, 'none', 'no forecast is never a risk');
assert.equal(classifyWeatherRisk([]).at, '', 'an empty window has no hour to point at');

assert.equal(
  classifyWeatherRisk([hour({ precipitationProbability: WEATHER_RISK_POP_THRESHOLD - 1 })]).severity,
  'none',
  'one point below the probability threshold is quiet',
);
assert.equal(
  classifyWeatherRisk([hour({ precipitationProbability: WEATHER_RISK_POP_THRESHOLD })]).severity,
  'likely',
  'the probability threshold is inclusive',
);
assert.equal(
  classifyWeatherRisk([hour({ precipitationMm: WEATHER_RISK_PRECIP_MM_THRESHOLD })]).severity,
  'likely',
  'the mm/h threshold is inclusive',
);
assert.equal(
  classifyWeatherRisk([hour({ windSpeedKmh: WEATHER_RISK_WIND_KPH_THRESHOLD })]).severity,
  'likely',
  'wind alone can put a game at risk',
);
assert.equal(
  classifyWeatherRisk([hour({ precipitationProbability: WEATHER_RISK_HEAVY_POP_THRESHOLD })])
    .severity,
  'heavy',
);
assert.equal(
  classifyWeatherRisk([hour({ conditionKey: 'thunderstorm' })]).severity,
  'storm',
  'a thunderstorm is a storm whatever the numbers say',
);
assert.equal(classifyWeatherRisk([hour({ windSpeedKmh: 70 })]).severity, 'storm');

{
  // The whole game window counts, not just the first hour.
  const assessment = classifyWeatherRisk([
    hour({ time: T0, precipitationProbability: 10 }),
    hour({ time: T1, precipitationProbability: 70 }),
    hour({ time: T2, precipitationProbability: 20, windSpeedKmh: 12 }),
  ]);
  assert.equal(assessment.severity, 'likely');
  assert.equal(assessment.pop, 70, 'the peak probability is reported');
  assert.equal(assessment.at, T1, 'the reported hour is the one that drove the verdict');
  assert.equal(assessment.windDriven, false);
}

{
  const windy = classifyWeatherRisk([hour({ windSpeedKmh: 45, precipitationProbability: 5 })]);
  assert.equal(windy.windDriven, true, 'wind with no rain reads slate');
  const rainy = classifyWeatherRisk([hour({ windSpeedKmh: 45, precipitationProbability: 80 })]);
  assert.equal(rainy.windDriven, false, 'rain wins the colour when both cross');
}

assert.equal(
  classifyWeatherRisk([hour({ precipitationProbability: null, windSpeedKmh: null })]).severity,
  'none',
  'null readings are not treated as zero-risk surprises',
);

assert.equal(severityRose('likely', 'heavy'), true);
assert.equal(severityRose('heavy', 'likely'), false);
assert.equal(severityRose('likely', 'likely'), false);
assert.equal(severityRose(null, 'likely'), true);
assert.equal(isAlertableSeverity('none'), false);
assert.equal(isAlertableSeverity('likely'), true);

// ---------------------------------------------------------------------------
// Outdoor detection
// ---------------------------------------------------------------------------

{
  const indoorOnly = detectOutdoor({ gameCourts: [{ isIndoor: true }] });
  assert.equal(indoorOnly.known, true);
  assert.equal(indoorOnly.outdoor, false, 'an indoor game is never at risk');
}

{
  const outdoor = detectOutdoor({ gameCourts: [{ isIndoor: false }] });
  assert.equal(outdoor.outdoor, true);
  assert.equal(outdoor.source, 'courts');
  assert.equal(outdoor.outdoorCourtCount, 1);
  assert.equal(outdoor.totalCourtCount, 1);
}

{
  // Multi-court: at risk if *any* court is outdoor, and the counts drive the
  // "1 of 2 courts outdoor" copy.
  const mixed = detectOutdoor({
    gameCourts: [{ isIndoor: true }, { isIndoor: false }],
  });
  assert.equal(mixed.outdoor, true);
  assert.equal(mixed.outdoorCourtCount, 1);
  assert.equal(mixed.totalCourtCount, 2);
}

{
  const primaryOnly = detectOutdoor({ gameCourts: [], primaryCourt: { isIndoor: false } });
  assert.equal(primaryOnly.outdoor, true);
  assert.equal(primaryOnly.source, 'courts');
}

{
  // No courts at all → the club's active-courts majority decides.
  const majorityOutdoor = detectOutdoor({
    gameCourts: [],
    clubActiveCourts: [{ isIndoor: false }, { isIndoor: false }, { isIndoor: true }],
  });
  assert.equal(majorityOutdoor.outdoor, true);
  assert.equal(majorityOutdoor.known, true);
  assert.equal(majorityOutdoor.source, 'clubMajority');
  assert.equal(majorityOutdoor.totalCourtCount, 0, 'the club fallback counts no game courts');

  const majorityIndoor = detectOutdoor({
    gameCourts: [],
    clubActiveCourts: [{ isIndoor: true }, { isIndoor: true }, { isIndoor: false }],
  });
  assert.equal(majorityIndoor.outdoor, false);
  assert.equal(majorityIndoor.known, true);
}

{
  // Unknown: no courts, no club courts, or an exact tie.
  const nothing = detectOutdoor({ gameCourts: [] });
  assert.equal(nothing.known, false);
  assert.equal(nothing.outdoor, false);

  const tie = detectOutdoor({
    gameCourts: [],
    clubActiveCourts: [{ isIndoor: true }, { isIndoor: false }],
  });
  assert.equal(tie.known, false, 'a tie is not a majority — stay quiet');
  assert.equal(tie.source, 'unknown');
}

// ---------------------------------------------------------------------------
// Alert windows (fixed clock)
// ---------------------------------------------------------------------------

const NOW = new Date('2026-09-21T07:00:00.000Z');
const HOUR = 60 * 60 * 1000;

{
  const first = alertWindowBounds('first', NOW);
  assert.equal(first.from.toISOString(), new Date(NOW.getTime() + 11.5 * HOUR).toISOString());
  assert.equal(first.to.toISOString(), new Date(NOW.getTime() + 12.5 * HOUR).toISOString());

  const second = alertWindowBounds('second', NOW);
  assert.equal(second.from.toISOString(), new Date(NOW.getTime() + 1.5 * HOUR).toISOString());
  assert.equal(second.to.toISOString(), new Date(NOW.getTime() + 2.5 * HOUR).toISOString());
}

assert.equal(isInAlertWindow('first', new Date(NOW.getTime() + 12 * HOUR), NOW), true);
assert.equal(isInAlertWindow('first', new Date(NOW.getTime() + 13 * HOUR), NOW), false);
assert.equal(isInAlertWindow('second', new Date(NOW.getTime() + 2 * HOUR), NOW), true);
assert.equal(isInAlertWindow('second', new Date(NOW.getTime() + 12 * HOUR), NOW), false);
assert.equal(
  isInAlertWindow('first', new Date(NOW.getTime() + 12 * HOUR), NOW) &&
    isInAlertWindow('second', new Date(NOW.getTime() + 12 * HOUR), NOW),
  false,
  'the two windows never overlap, so a game cannot be alerted twice in one pass',
);

// ---------------------------------------------------------------------------
// Dedupe decisions
// ---------------------------------------------------------------------------

const sentLikely: WeatherAlertState = {
  severity: 'likely',
  sentAt: [NOW.toISOString()],
  lastEvaluatedAt: NOW.toISOString(),
};

assert.deepEqual(decideAlert({ window: 'first', severity: 'likely', state: null }), {
  send: true,
  reason: 'send',
});
assert.deepEqual(decideAlert({ window: 'first', severity: 'none', state: null }), {
  send: false,
  reason: 'belowThreshold',
});
assert.deepEqual(decideAlert({ window: 'first', severity: 'heavy', state: sentLikely }), {
  send: false,
  reason: 'alreadySent',
});
assert.deepEqual(decideAlert({ window: 'second', severity: 'likely', state: sentLikely }), {
  send: false,
  reason: 'severityUnchanged',
});
assert.deepEqual(decideAlert({ window: 'second', severity: 'heavy', state: sentLikely }), {
  send: true,
  reason: 'send',
});
assert.deepEqual(
  decideAlert({
    window: 'second',
    severity: 'storm',
    state: { ...sentLikely, keepAsPlannedAt: NOW.toISOString() },
  }),
  { send: false, reason: 'keptAsPlanned' },
  '"Keep as planned" silences the 2 h alert even when it got much worse',
);
assert.deepEqual(
  decideAlert({
    window: 'first',
    severity: 'storm',
    state: {
      severity: 'none',
      sentAt: [],
      keepAsPlannedAt: NOW.toISOString(),
      lastEvaluatedAt: NOW.toISOString(),
    },
  }),
  { send: false, reason: 'keptAsPlanned' },
  '"Keep as planned" tapped off the 48 h card pill also silences the 12 h alert',
);
assert.deepEqual(decideAlert({ window: 'second', severity: 'likely', state: null }), {
  send: true,
  reason: 'send',
});

// ---------------------------------------------------------------------------
// Persisted state
// ---------------------------------------------------------------------------

assert.equal(parseWeatherAlertState(null), null);
assert.equal(parseWeatherAlertState('nonsense'), null);
assert.equal(parseWeatherAlertState({ severity: 'sunny' }), null, 'an unknown class is refused');
assert.deepEqual(parseWeatherAlertState({ severity: 'likely' }), {
  severity: 'likely',
  sentAt: [],
  lastEvaluatedAt: new Date(0).toISOString(),
});
assert.deepEqual(
  parseWeatherAlertState({
    severity: 'heavy',
    sentAt: ['a', 'b'],
    keepAsPlannedAt: 'c',
    lastEvaluatedAt: 'd',
  }),
  { severity: 'heavy', sentAt: ['a', 'b'], keepAsPlannedAt: 'c', lastEvaluatedAt: 'd' },
);

{
  const quiet = nextWeatherAlertState({
    previous: sentLikely,
    severity: 'none',
    now: NOW,
    sent: false,
  });
  assert.equal(quiet.severity, 'likely', 'a quiet pass never lowers the recorded class');
  assert.equal(quiet.sentAt.length, 1, 'a quiet pass never records a send');

  const sent = nextWeatherAlertState({
    previous: sentLikely,
    severity: 'storm',
    now: NOW,
    sent: true,
  });
  assert.equal(sent.severity, 'storm');
  assert.equal(sent.sentAt.length, 2);

  const kept = nextWeatherAlertState({
    previous: { ...sentLikely, keepAsPlannedAt: 'x' },
    severity: 'storm',
    now: NOW,
    sent: false,
  });
  assert.equal(kept.keepAsPlannedAt, 'x', '"Keep as planned" survives every later pass');
}

// ---------------------------------------------------------------------------
// The full per-game evaluation (what the scheduler step runs)
// ---------------------------------------------------------------------------

{
  const indoor = evaluateGameWeather({
    window: 'first',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: true }] }),
    hours: [hour({ precipitationProbability: 95 })],
    state: null,
    now: NOW,
  });
  assert.equal(indoor.skip, 'indoorOrUnknown');
  assert.equal(indoor.send, false);
  assert.equal(indoor.nextState, null, 'a skipped game is never written to');
}

{
  const unknown = evaluateGameWeather({
    window: 'first',
    detection: detectOutdoor({ gameCourts: [] }),
    hours: [hour({ precipitationProbability: 95 })],
    state: null,
    now: NOW,
  });
  assert.equal(unknown.skip, 'indoorOrUnknown');
}

{
  const noForecast = evaluateGameWeather({
    window: 'first',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: false }] }),
    hours: [],
    state: null,
    now: NOW,
  });
  assert.equal(noForecast.skip, 'noForecast');
  assert.equal(noForecast.nextState, null);
}

{
  const first = evaluateGameWeather({
    window: 'first',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: true }, { isIndoor: false }] }),
    hours: [hour({ time: T1, precipitationProbability: 70 })],
    state: null,
    now: NOW,
  });
  assert.equal(first.send, true, 'a multi-court game with one outdoor court alerts');
  assert.equal(first.escalated, false);
  assert.equal(first.assessment?.severity, 'likely');
  assert.equal(first.nextState?.sentAt.length, 1);

  const secondSameClass = evaluateGameWeather({
    window: 'second',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: false }] }),
    hours: [hour({ time: T1, precipitationProbability: 72 })],
    state: first.nextState,
    now: NOW,
  });
  assert.equal(secondSameClass.send, false, '60 % → 72 % is the same class: no second alert');
  assert.equal(secondSameClass.reason, 'severityUnchanged');

  const secondWorse = evaluateGameWeather({
    window: 'second',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: false }] }),
    hours: [hour({ time: T2, precipitationProbability: 90 })],
    state: first.nextState,
    now: NOW,
  });
  assert.equal(secondWorse.send, true);
  assert.equal(secondWorse.escalated, true, 'the 2 h alert uses the "got worse" copy');
  assert.equal(secondWorse.nextState?.sentAt.length, 2);

  const secondKept = evaluateGameWeather({
    window: 'second',
    detection: detectOutdoor({ gameCourts: [{ isIndoor: false }] }),
    hours: [hour({ time: T2, precipitationProbability: 90 })],
    state: { ...first.nextState!, keepAsPlannedAt: NOW.toISOString() },
    now: NOW,
  });
  assert.equal(secondKept.send, false, '"Keep as planned" suppresses the 2 h alert');
  assert.equal(secondKept.reason, 'keptAsPlanned');
  assert.equal(
    secondKept.nextState?.keepAsPlannedAt,
    NOW.toISOString(),
    'the suppression is persisted, so a restart cannot un-suppress it',
  );
}

// ---------------------------------------------------------------------------
// Source scan — the invariants a refactor must not "simplify away"
// ---------------------------------------------------------------------------

const here = path.join(__dirname);
const riskSource = readFileSync(path.join(here, 'weatherRisk.ts'), 'utf8');
const serviceSource = readFileSync(path.join(here, 'weatherAlert.service.ts'), 'utf8');

for (const marker of ['detection.known', 'detection.outdoor']) {
  assert.equal(
    riskSource.includes(marker),
    true,
    `weatherRisk.ts must keep gating on "${marker}" — unknown courts never alert`,
  );
}
assert.equal(
  riskSource.includes('severityRose(input.state?.severity, input.severity)'),
  true,
  'the second alert must stay gated on a severity rise',
);
assert.equal(
  serviceSource.includes('weatherAlertState'),
  true,
  'the dedupe must stay persisted on the Game row, not in an in-memory Set',
);
assert.equal(
  /new\s+Set\s*<\s*string\s*>\s*\(\s*\)[^\n]*sent/i.test(serviceSource),
  false,
  'the weather alert dedupe must never become an in-memory Set',
);

/*
 * Claim-then-dispatch. The alert used to be sent *before* `sentAt[]` was
 * written, so a restart between the two re-alerted the whole roster on the very
 * next tick (the 12 h window is wider than the 30-minute cadence).
 */
const claimIndex = serviceSource.indexOf('await claimAlertSend(');
const dispatchIndex = serviceSource.indexOf('await notifyGame(');
assert.ok(claimIndex > 0, 'the sending branch must take a persisted claim');
assert.ok(dispatchIndex > 0, 'the sending branch must still fan out');
assert.ok(
  claimIndex < dispatchIndex,
  'the dedupe marker must be persisted BEFORE the roster is notified',
);
assert.ok(
  serviceSource.includes("jsonb_array_length(\"weatherAlertState\" -> 'sentAt')") &&
    serviceSource.includes('= ${previousSentCount}'),
  'the claim must be conditional on the sentAt length it was built from',
);
assert.ok(
  serviceSource.includes(
    'NOT (COALESCE("weatherAlertState", \'{}\'::jsonb) ? \'keepAsPlannedAt\')',
  ),
  'the claim must also lose to a "Keep as planned" that landed mid-sweep',
);

/*
 * `weatherAlertState` is one blob shared by the sweep and "Keep as planned".
 * Neither side may rewrite it wholesale, or it silently erases the other —
 * which now matters more, because `keepAsPlannedAt` suppresses *both* windows.
 */
assert.equal(
  /game\.update\(\s*\{[\s\S]{0,200}?weatherAlertState/.test(serviceSource),
  false,
  'weatherAlertState must never be written with a wholesale prisma game.update',
);
for (const merge of ['mergeKeepAsPlanned', 'touchEvaluatedAt']) {
  assert.ok(
    serviceSource.includes(`async function ${merge}(`),
    `${merge} must exist — every weatherAlertState write is a merge, not a rewrite`,
  );
}
assert.ok(
  serviceSource.includes(
    "jsonb_build_object('keepAsPlannedAt', \"weatherAlertState\" -> 'keepAsPlannedAt')",
  ),
  'the sweep must carry an existing keepAsPlannedAt across its own write',
);

/*
 * PRD 357 bolted the weather sweep onto `GameStatusScheduler`, whose tick is
 * otherwise unbounded. Without a re-entrancy guard, one tick running past 30
 * minutes makes node-cron fire the next callback concurrently, and two sweeps
 * reading the same `weatherAlertState` is how a duplicate roster-wide alert
 * happens with no crash required. Every *new* scheduler in the programme has
 * the `running` flag; this one has to as well.
 */
const schedulerSource = readFileSync(
  path.join(here, '..', 'gameStatusScheduler.service.ts'),
  'utf8',
);
assert.ok(
  /private\s+running\s*=\s*false;/.test(schedulerSource),
  'GameStatusScheduler must carry the house re-entrancy flag',
);
assert.ok(
  /if \(this\.running\)/.test(schedulerSource),
  'the tick must return early while the previous one is still running',
);
assert.ok(
  /} finally \{\s*\n\s*this\.running = false;/.test(schedulerSource),
  'the flag must be cleared in a finally, so a throw cannot wedge the scheduler',
);
assert.ok(
  schedulerSource.includes("cron.schedule('0,30 * * * *'"),
  'the cadence the alert windows are sized against must not change',
);
for (const step of ['updateGameStatuses', 'sendReminders', 'sendWeatherAlerts']) {
  assert.ok(
    schedulerSource.includes(`await this.${step}();`),
    `${step} must stay part of the tick`,
  );
}

console.log('weatherRisk.test.ts: ok');
