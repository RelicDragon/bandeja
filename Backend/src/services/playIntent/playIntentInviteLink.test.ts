import assert from 'node:assert/strict';
import { PlayIntentStatus } from '@prisma/client';
import { invitePlayIntentLinkOutcome, shouldLinkPlayIntent } from './playIntentInviteLink';

assert.equal(
  shouldLinkPlayIntent({ userId: 'u1', status: PlayIntentStatus.OPEN }, 'u1', false),
  true,
);
assert.equal(
  shouldLinkPlayIntent({ userId: 'u1', status: PlayIntentStatus.OPEN }, 'u1', true),
  false,
);
assert.equal(
  shouldLinkPlayIntent({ userId: 'u1', status: PlayIntentStatus.MATCHED }, 'u1', false),
  false,
);
assert.equal(
  shouldLinkPlayIntent({ userId: 'u1', status: PlayIntentStatus.OPEN }, 'u2', false),
  false,
);

const open = { id: 'i1', userId: 'u1', status: PlayIntentStatus.OPEN };
const matched = { id: 'i1', userId: 'u1', status: PlayIntentStatus.MATCHED };
const cancelled = { id: 'i1', userId: 'u1', status: PlayIntentStatus.CANCELLED };

assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: open,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: 'i1',
  }),
  true,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: matched,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: null,
  }),
  false,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: open,
    receiverId: 'u1',
    inProposal: true,
    linkedIntentId: null,
  }),
  false,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: open,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: null,
  }),
  false,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: cancelled,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: null,
  }),
  null,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: 'i1',
    intent: null,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: null,
  }),
  null,
);
assert.equal(
  invitePlayIntentLinkOutcome({
    requestedPlayIntentId: null,
    intent: open,
    receiverId: 'u1',
    inProposal: false,
    linkedIntentId: null,
  }),
  null,
);

console.log('playIntentInviteLink.test.ts: ok');
