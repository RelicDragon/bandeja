import assert from 'node:assert/strict';
import { BracketSlotKind, type Prisma } from '@prisma/client';
import { BracketAdvancementService } from './bracketAdvancement.service';

async function run(): Promise<void> {
  const unresolvedMatchFeeder = {
    id: 'semi-2',
    slotKind: BracketSlotKind.MAIN,
    leagueParticipantId: 'temporary-quarterfinal-winner',
    gameId: null,
    game: null,
  };

  const participantId = await BracketAdvancementService.participantIdFromFeeder(
    unresolvedMatchFeeder,
    {} as Prisma.TransactionClient,
    BracketSlotKind.MAIN,
  );

  assert.equal(
    participantId,
    null,
    'a downstream match must wait until its non-BYE feeder game is FINAL',
  );

  const byeParticipantId = await BracketAdvancementService.participantIdFromFeeder(
    {
      ...unresolvedMatchFeeder,
      id: 'bye-1',
      slotKind: BracketSlotKind.BYE,
      leagueParticipantId: 'bye-participant',
    },
    {} as Prisma.TransactionClient,
    BracketSlotKind.MAIN,
  );

  assert.equal(
    byeParticipantId,
    'bye-participant',
    'a BYE remains the only feeder that can advance without a FINAL game',
  );
}

run()
  .then(() => console.log('bracketAdvancementReadiness tests passed'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
