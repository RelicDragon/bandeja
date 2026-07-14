import assert from 'node:assert/strict';
import {
  AVAILABLE_GAMES_MAX_TAKE,
  buildAvailableGamesPageMeta,
  clampAvailableTake,
  decodeAvailableGamesCursor,
  encodeAvailableGamesCursor,
  resolveAvailablePageAfterFilter,
} from './availableGamesBounds';

{
  assert.equal(clampAvailableTake(9999, 300), AVAILABLE_GAMES_MAX_TAKE);
  assert.equal(clampAvailableTake(-1, 300), 300);
  assert.equal(clampAvailableTake('50', 300), 50);
}

{
  const cursor = encodeAvailableGamesCursor({
    startTime: '2026-07-01T10:00:00.000Z',
    id: 'g1',
  });
  const decoded = decodeAvailableGamesCursor(cursor);
  assert.equal(decoded?.id, 'g1');
  assert.equal(decoded?.startTime, '2026-07-01T10:00:00.000Z');
  assert.equal(decodeAvailableGamesCursor('nope'), null);
}

{
  const rows = Array.from({ length: 301 }, (_, i) => ({
    id: `g${i}`,
    startTime: new Date(Date.UTC(2026, 6, 1, i % 24)),
  }));
  const meta = buildAvailableGamesPageMeta(rows, 300);
  assert.equal(meta.hasMore, true);
  assert.equal(meta.truncated, true);
  assert.ok(meta.nextCursor);
  assert.equal(meta.bound, AVAILABLE_GAMES_MAX_TAKE);
}

{
  const meta = buildAvailableGamesPageMeta(
    [{ id: 'a', startTime: new Date() }],
    300,
  );
  assert.equal(meta.hasMore, false);
  assert.equal(meta.nextCursor, null);
}

{
  // availableSlots overscan: leftover open games in the scan must not be skipped
  // (regression: tipped at scan end and discarded pageRows[take:]).
  const scanned = Array.from({ length: 300 }, (_, i) => ({
    id: `s${i}`,
    startTime: new Date(Date.UTC(2026, 6, 1, 0, i)),
  }));
  const filtered = scanned.filter((_, i) => i % 2 === 0); // 150 open
  const take = 100;
  const { page, hasMore, cursorTip } = resolveAvailablePageAfterFilter(
    scanned,
    filtered,
    take,
    true,
  );
  assert.equal(page.length, 100);
  assert.equal(hasMore, true);
  assert.equal(cursorTip?.id, 's198'); // filtered[99] === scanned[198]
  assert.notEqual(cursorTip?.id, 's299');
}

{
  const scanned = Array.from({ length: 50 }, (_, i) => ({
    id: `s${i}`,
    startTime: new Date(Date.UTC(2026, 6, 1, 0, i)),
  }));
  const { page, hasMore, cursorTip } = resolveAvailablePageAfterFilter(
    scanned,
    scanned,
    100,
    true,
  );
  assert.equal(page.length, 50);
  assert.equal(hasMore, true);
  assert.equal(cursorTip?.id, 's49');
}

{
  const scanned = [{ id: 'a', startTime: new Date() }];
  const { page, hasMore, cursorTip } = resolveAvailablePageAfterFilter(
    scanned,
    scanned,
    100,
    false,
  );
  assert.equal(page.length, 1);
  assert.equal(hasMore, false);
  assert.equal(cursorTip, null);
}

console.log('availableGamesBounds.test.ts: ok');
