/**
 * Pure tests (no DB): how a write outcome becomes the action closing (booking plan §14.6):
 * done, partial (still EXECUTED), handled failure with its own message, thrown failure.
 */
import assert from 'node:assert/strict';
import { agentFailureModelNote, closingFromAgentWriteOutcome } from '../agentActionExecute';

const now = new Date('2026-09-30T12:00:00Z');

// Plain success: unchanged behaviour, no partial flag anywhere.
{
  const closing = closingFromAgentWriteOutcome({ message: 'Game created', modelData: { gameId: 'g1' } }, now, false);
  assert.equal(closing.status, 'EXECUTED');
  assert.deepEqual(closing.result, { ok: true, message: 'Game created' });
  assert.equal(closing.modelNote, 'The user confirmed and the change was applied.');
  assert.deepEqual(closing.modelData, { gameId: 'g1' });
  assert.equal(closing.executedAt, now);
}

// Partial: EXECUTED, `partial` on the card result and in the model data, note quotes the message.
{
  const closing = closingFromAgentWriteOutcome(
    { message: '2 of 3 courts booked', partial: true, modelData: { booked: 2 } },
    now,
    false,
  );
  assert.equal(closing.status, 'EXECUTED');
  assert.equal(closing.modelStatus, 'executed');
  assert.equal(closing.result.ok, true);
  assert.equal(closing.result.partial, true);
  assert.equal(closing.result.message, '2 of 3 courts booked');
  assert.deepEqual(closing.modelData, { booked: 2, partial: true });
  assert.match(closing.modelNote, /PARTLY/);
  assert.match(closing.modelNote, /"2 of 3 courts booked"/);
  assert.doesNotMatch(closing.modelNote, /Nothing was changed/);
}

// Handled failure, nothing changed: FAILED with the tool's own message + "Nothing was changed".
{
  const closing = closingFromAgentWriteOutcome(
    { message: 'Nothing booked: the court was taken', failed: { changed: false } },
    now,
    false,
  );
  assert.equal(closing.status, 'FAILED');
  assert.equal(closing.modelStatus, 'failed');
  assert.deepEqual(closing.result, { ok: false, message: 'Nothing booked: the court was taken' });
  assert.match(closing.modelNote, /"Nothing booked: the court was taken"/);
  assert.match(closing.modelNote, /Nothing was changed by this action\./);
  assert.equal(closing.executedAt, undefined);
}

// Handled failure that left something changed: custom message, never "Nothing was changed".
{
  const closing = closingFromAgentWriteOutcome(
    {
      message: 'Booked; game not created',
      failed: { changed: true },
      partial: true,
      entities: [{ type: 'handoff', url: '/create-game?bookingIds=b1', label: 'Create the game' }],
    },
    now,
    true,
  );
  assert.equal(closing.status, 'FAILED');
  assert.equal(closing.result.ok, false);
  assert.equal(closing.result.partial, true);
  assert.equal(closing.result.entities?.length, 1);
  assert.match(closing.modelNote, /^Tried to apply automatically/);
  assert.match(closing.modelNote, /"Booked; game not created"/);
  assert.match(closing.modelNote, /DID change/);
  assert.doesNotMatch(closing.modelNote, /Nothing was changed/);
}

// Thrown failure (no outcome): keeps the "Nothing was changed" note.
{
  assert.equal(
    agentFailureModelNote(false, 'forbidden', { changed: false }),
    'The user confirmed, but the change failed (forbidden). Nothing was changed by this action.',
  );
}

console.log('agentActionOutcome.test: ok');
