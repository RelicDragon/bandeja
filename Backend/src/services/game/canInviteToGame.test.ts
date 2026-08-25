import assert from 'node:assert/strict';
import { viewerCanInviteFromFacts, viewerCanInviteFromLoadedGame } from './canInviteToGame';

assert.equal(
  viewerCanInviteFromFacts({
    hasRealParticipantStatus: false,
    isOwnerOrAdmin: true,
    anyoneCanInvite: true,
    isParticipant: true,
  }),
  false,
);

assert.equal(
  viewerCanInviteFromFacts({
    hasRealParticipantStatus: true,
    isOwnerOrAdmin: true,
    anyoneCanInvite: false,
    isParticipant: false,
  }),
  true,
);

assert.equal(
  viewerCanInviteFromFacts({
    hasRealParticipantStatus: true,
    isOwnerOrAdmin: false,
    anyoneCanInvite: false,
    isParticipant: true,
  }),
  false,
);

assert.equal(
  viewerCanInviteFromFacts({
    hasRealParticipantStatus: true,
    isOwnerOrAdmin: false,
    anyoneCanInvite: true,
    isParticipant: true,
  }),
  true,
);

assert.equal(
  viewerCanInviteFromFacts({
    hasRealParticipantStatus: true,
    isOwnerOrAdmin: false,
    anyoneCanInvite: true,
    isParticipant: false,
  }),
  false,
);

assert.equal(
  viewerCanInviteFromLoadedGame({
    viewerId: 'me',
    isAdmin: false,
    anyoneCanInvite: false,
    participants: [{ userId: 'me', status: 'PLAYING', role: 'PARTICIPANT' }],
  }),
  false,
);

assert.equal(
  viewerCanInviteFromLoadedGame({
    viewerId: 'me',
    isAdmin: false,
    anyoneCanInvite: true,
    participants: [{ userId: 'me', status: 'PLAYING', role: 'PARTICIPANT' }],
  }),
  true,
);

assert.equal(
  viewerCanInviteFromLoadedGame({
    viewerId: 'me',
    isAdmin: false,
    anyoneCanInvite: false,
    participants: [{ userId: 'me', status: 'PLAYING', role: 'PARTICIPANT' }],
    parentParticipants: [{ status: 'PLAYING', role: 'OWNER' }],
  }),
  true,
);

console.log('canInviteToGame.test.ts ok');
