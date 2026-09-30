/**
 * Pure checks for `canAgentViewGameRow` — including system games (`cityId === null`),
 * which the DB fixture cannot create because `Game.cityId` is non-null.
 */
import assert from 'node:assert/strict';
import { EntityType, EventApprovalStatus } from '@prisma/client';
import { canAgentViewGameRow, type AgentGameVisibilityFacts } from '../agentGameAccess';

const user = { isAdmin: false };
const admin = { isAdmin: true };

const base: AgentGameVisibilityFacts = {
  cityId: 'city',
  isPublic: true,
  entityType: EntityType.GAME,
  eventApprovalStatus: null,
  parentIsPublic: null,
  parentEntityType: null,
  viewerIsOwner: false,
  viewerOnRoster: false,
};

const cases: Array<[string, typeof user, Partial<AgentGameVisibilityFacts>, boolean]> = [
  ['public game, stranger', user, {}, true],
  ['private game, stranger', user, { isPublic: false }, false],
  ['private game, on roster', user, { isPublic: false, viewerOnRoster: true }, true],
  ['private game, admin', admin, { isPublic: false }, true],
  ['system game, stranger', user, { cityId: null }, false],
  ['system game, on roster', user, { cityId: null, viewerOnRoster: true }, false],
  ['system game, owner', user, { cityId: null, viewerIsOwner: true, viewerOnRoster: true }, false],
  ['system game, admin', admin, { cityId: null }, true],
  [
    'pending event, roster non-owner',
    user,
    { entityType: EntityType.EVENT, eventApprovalStatus: EventApprovalStatus.ON_APPROVE, viewerOnRoster: true },
    false,
  ],
  [
    'pending event, owner',
    user,
    {
      entityType: EntityType.EVENT,
      eventApprovalStatus: EventApprovalStatus.ON_APPROVE,
      viewerIsOwner: true,
      viewerOnRoster: true,
    },
    true,
  ],
  [
    'declined event, owner',
    user,
    {
      entityType: EntityType.EVENT,
      eventApprovalStatus: EventApprovalStatus.DECLINED,
      viewerIsOwner: true,
      viewerOnRoster: true,
    },
    true,
  ],
  ['event with null approval, stranger', user, { entityType: EntityType.EVENT }, false],
  ['approved public event, stranger', user, { entityType: EntityType.EVENT, eventApprovalStatus: EventApprovalStatus.APPROVED }, true],
  ['pending event, admin', admin, { entityType: EntityType.EVENT, eventApprovalStatus: EventApprovalStatus.ON_APPROVE }, true],
  // Non-league parents keep the strict rule.
  ['public child under private parent, stranger', user, { parentIsPublic: false, parentEntityType: EntityType.TOURNAMENT }, false],
  ['public child under private parent, roster', user, { parentIsPublic: false, parentEntityType: EntityType.TOURNAMENT, viewerOnRoster: true }, true],
  ['public child under public parent, stranger', user, { parentIsPublic: true, parentEntityType: EntityType.TOURNAMENT }, true],
  ['private child under public parent, stranger', user, { isPublic: false, parentIsPublic: true, parentEntityType: EntityType.TOURNAMENT }, false],
  // League content is for everyone (product decision): season and its fixtures, public or not.
  ['private league season, stranger', user, { entityType: EntityType.LEAGUE_SEASON, isPublic: false }, true],
  ['private fixture under private season, stranger', user, { entityType: EntityType.LEAGUE, isPublic: false, parentIsPublic: false, parentEntityType: EntityType.LEAGUE_SEASON }, true],
  ['system league season, stranger', user, { entityType: EntityType.LEAGUE_SEASON, cityId: null }, false],
  ['private casual game, stranger', user, { entityType: EntityType.GAME, isPublic: false }, false],
];

for (const [name, principal, facts, expected] of cases) {
  assert.equal(canAgentViewGameRow(principal, { ...base, ...facts }), expected, name);
}

console.log(`agentGameVisibility.test.ts: ${cases.length} cases ok`);
