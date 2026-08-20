import assert from 'node:assert/strict';
import { groupLinkedGameRows } from './groupLinkedGameRows';

const game = {
  id: 'game-1',
  name: 'Friday',
  startTime: new Date('2026-06-19T09:00:00.000Z'),
  endTime: new Date('2026-06-19T10:00:00.000Z'),
  timeIsSet: true,
  status: 'ANNOUNCED',
};

const rows = [
  {
    externalBookingId: 'b-open',
    bookingStart: new Date('2026-06-19T09:00:00.000Z'),
    bookingEnd: new Date('2026-06-19T10:00:00.000Z'),
    game,
  },
  {
    externalBookingId: 'b-open',
    bookingStart: new Date('2026-06-19T10:00:00.000Z'),
    bookingEnd: new Date('2026-06-19T11:00:00.000Z'),
    game: { ...game, id: 'game-2' },
  },
];

const grouped = groupLinkedGameRows(rows, ['b-open', 'b-empty']);
assert.equal(grouped['b-empty']?.length, 0);
assert.equal(grouped['b-open']?.length, 2);
assert.equal(grouped['b-open']?.[0]?.id, 'game-1');
assert.equal(grouped['b-open']?.[1]?.id, 'game-2');
assert.deepEqual(Object.keys(grouped).sort(), ['b-empty', 'b-open']);

console.log('groupLinkedGameRows ok');
