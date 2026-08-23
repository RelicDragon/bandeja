import assert from 'node:assert/strict';
import {
  AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE,
  resolveCalendarDayIndexPage,
} from './availableGamesQuery';
import {
  AVAILABLE_GAMES_MAX_TAKE,
  AVAILABLE_GAMES_MONTH_TAKE,
  decodeAvailableGamesCursor,
} from './availableGamesBounds';

assert.equal(AVAILABLE_GAMES_MONTH_TAKE, 300);
assert.equal(AVAILABLE_GAMES_MAX_TAKE, 300);
assert.ok(AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE >= AVAILABLE_GAMES_MONTH_TAKE);

const rows = Array.from({ length: AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE + 1 }, (_, index) => ({
  id: `g-${String(index).padStart(5, '0')}`,
  startTime: new Date(Date.UTC(2026, 7, 1, 0, 0, index)),
}));
const firstPage = resolveCalendarDayIndexPage(rows);
assert.equal(firstPage.rows.length, AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE);
assert.equal(firstPage.hasMore, true);
assert.deepEqual(decodeAvailableGamesCursor(firstPage.nextCursor), {
  id: rows[AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE - 1].id,
  startTime: rows[AVAILABLE_GAMES_DAY_INDEX_PAGE_SIZE - 1].startTime.toISOString(),
});

const finalPage = resolveCalendarDayIndexPage(rows.slice(0, 10));
assert.equal(finalPage.rows.length, 10);
assert.equal(finalPage.hasMore, false);
assert.equal(finalPage.nextCursor, null);

console.log('availableGamesDayIndex.pagination.test.ts: ok');
