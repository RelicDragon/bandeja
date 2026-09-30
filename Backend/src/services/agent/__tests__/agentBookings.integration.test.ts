/**
 * Phase-7a booking reads (real dev DB, no LLM): `list_my_bookings` and `resolveBookingRef`.
 *   - actor × game matrix: a booking linked to each fixture game is listed / resolvable only
 *     for that game's OWNER / ADMIN / PLAYING (never for the stranger, invited, queued, the
 *     platform admin, or anyone on a private game they are not on); unapproved EVENT only
 *     for its owner;
 *   - dedupe of a booking linked to two games (`linkedGameIds`);
 *   - Weltner receipts: only the owner's, CONFIRMED / uncertain (UNKNOWN) / never REJECTED,
 *     a linked receipt is one `weltner:` item, another user's receipt ref is 404;
 *   - Nspadel link, `canCancel` rules, `listComplete` + handoff, past range, club filter,
 *     club timezone, malformed refs, strict input;
 *   - `canCancel` with `bookedByUserId` (7c): the booker may cancel, a connected owner may not
 *     cancel someone else's booking;
 *   - phase-7c `link_booking_to_game` / `unlink_booking`: happy paths (propose → fresh
 *     principal → authorize → execute), non-owner 403, hidden game 404, another user's ref 404,
 *     club mismatch, already linked, strict input (no model times), server-row times,
 *     `bookedByUserId` set on create/link and never overwritten, confirm-time re-check.
 * Pending actions are proposed on a COMPLETED run; never touches the run queue.
 */
import assert from 'node:assert/strict';
import { formatInTimeZone } from 'date-fns-tz';
import {
  AgentActionStatus,
  AgentRunStatus,
  ClubIntegrationType,
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
  WeltnerBookingState,
} from '@prisma/client';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';
import prisma from '../../../config/database';
import {
  AGENT_MATRIX_ACTORS,
  AGENT_MATRIX_GAMES,
  classifyAgentOutcome,
  createAgentPermissionFixture,
  matrixRow,
  type AgentMatrixExpectations,
} from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentChat } from '../agentChat.service';
import { resolveBookingRef } from '../booking/agentBookingSources';
import { linkBookingToGame, patchGameBookings } from '../../game/gameExternalBooking.service';
import { AGENT_BOOKING_I18N_EN } from '../i18n/agentBookingI18n';
import { AGENT_TOOL_DEFINITIONS } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import { BOOKING_LINK_TOOLS } from '../tools/bookingLinks.tools';
import { BOOKING_TOOLS } from '../tools/bookings.tools';
import { AgentToolRegistry, type AgentToolContext, type AgentToolDefinition } from '../tools/registry';

/** The production catalogue when this phase is registered; else the phase's tools on top. */
const ALL_TOOLS: AgentToolDefinition[] = [
  ...AGENT_TOOL_DEFINITIONS,
  ...([...BOOKING_TOOLS, ...BOOKING_LINK_TOOLS] as AgentToolDefinition[]).filter(
    (t) => !AGENT_TOOL_DEFINITIONS.some((registered) => registered.name === t.name),
  ),
];
const registry = new AgentToolRegistry(ALL_TOOLS);

type BookingDto = {
  bookingRef: string;
  provider: string;
  clubId: string;
  courtNames: string[];
  start: string;
  localStart: string;
  timeZone: string;
  state: string;
  linkedGameIds: string[];
  canCancel: boolean;
};
type ListData = { bookings: BookingDto[]; listComplete: boolean; incompleteProviders?: string[]; note?: string };

const HOUR = 60 * 60 * 1000;

async function listBookings(principal: AgentPrincipal, args: Record<string, unknown> = {}) {
  const result = await registry.executeTool(
    { principal, locale: 'en', timezone: 'UTC', now: new Date() },
    'list_my_bookings',
    { limit: 30, ...args },
  );
  assert.ok(result.ok, `list_my_bookings failed: ${JSON.stringify(result.data)}`);
  const data = result.data as ListData;
  const serialized = JSON.stringify(data);
  return { data, entities: result.entities ?? [], summary: result.summary, serialized };
}

function byExternal(data: ListData, entities: AgentEntityRef[], ref: string) {
  return { dto: data.bookings.find((b) => b.bookingRef === ref), entity: entities.find((e) => e.type === 'booking' && e.ref === ref) };
}

async function main(): Promise<void> {
  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const P = fixture.principals;
  const G = fixture.games;
  const cityIds: string[] = [];
  const clubIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  let tested = 0;
  try {
    // Club in a different timezone than the users' home city (UTC).
    const clubCity = await prisma.city.create({
      data: { name: `Agent booking city ${s}`, country: 'Test', timezone: 'Europe/Belgrade' },
    });
    cityIds.push(clubCity.id);
    const mkClub = async (name: string) =>
      prisma.club.create({
        data: {
          name: `${name} ${s}`,
          normalizedName: `${name} ${s}`.toLowerCase(),
          address: 'Test street 1',
          cityId: clubCity.id,
          courts: { create: [{ name: 'Court 1' }, { name: 'Court 2' }] },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
    const club = await mkClub('Agent booking club');
    const otherClub = await mkClub('Agent booking other club');
    clubIds.push(club.id, otherClub.id);
    const [court1, court2] = club.courts;

    const start = new Date(Date.now() + 48 * HOUR);
    const end = new Date(start.getTime() + 90 * 60 * 1000);
    const geb = (gameId: string, externalBookingId: string, extra: Record<string, unknown> = {}) =>
      prisma.gameExternalBooking.create({
        data: {
          gameId,
          externalBookingId,
          externalBookingProvider: ClubIntegrationType.BOOKTIME,
          courtId: court1.id,
          bookingStart: start,
          bookingEnd: end,
          ...extra,
        },
      });

    // --- matrix: one Booktime booking per fixture game ---
    const matrixRefs: Record<string, string> = {};
    for (const game of AGENT_MATRIX_GAMES) {
      const row = await geb(G[game], `bt-matrix-${game}-${s}`);
      matrixRefs[game] = `geb:${row.id}`;
    }
    //                          stranger invited queued player gameAdmin owner leagueOwner globalAdmin
    const expected: AgentMatrixExpectations = {
      public: matrixRow('N N N A A A N N'),
      private: matrixRow('N N N A A A N N'),
      archived: matrixRow('N N N A A A N N'),
      resultsLocked: matrixRow('N N N A A A N N'),
      pendingEvent: matrixRow('N N N N N A N N'),
      privateSeason: matrixRow('N N N N N N A N'),
      leagueFixture: matrixRow('N N N A A A N N'),
    };
    const lists = new Map<string, Awaited<ReturnType<typeof listBookings>>>();
    for (const actor of AGENT_MATRIX_ACTORS) lists.set(actor, await listBookings(P[actor]));
    const mismatches: string[] = [];
    for (const game of AGENT_MATRIX_GAMES) {
      for (const actor of AGENT_MATRIX_ACTORS) {
        const want = expected[game][actor];
        const listed = lists.get(actor)!.data.bookings.some((b) => b.bookingRef === matrixRefs[game]) ? 'allow' : 'not_found';
        const resolved = await classifyAgentOutcome(() => resolveBookingRef(P[actor], matrixRefs[game]));
        if (listed !== want) mismatches.push(`list ${game} × ${actor}: ${listed}, want ${want}`);
        if (resolved !== want) mismatches.push(`resolve ${game} × ${actor}: ${resolved}, want ${want}`);
        tested += 2;
      }
    }
    assert.deepEqual(mismatches, [], `booking matrix mismatches:\n${mismatches.join('\n')}`);
    // Private game: nothing about it reaches the stranger.
    assert.ok(!lists.get('stranger')!.serialized.includes(G.private), 'stranger never sees the private game id');
    console.log('booking matrix: ok');

    // --- dedupe: one booking linked to two games ---
    const sharedA = await geb(G.public, `bt-shared-${s}`, { courtId: court2.id });
    const sharedB = await geb(G.private, `bt-shared-${s}`, { courtId: court2.id });
    const sharedRef = `geb:${[sharedA.id, sharedB.id].sort()[0]}`;
    {
      const { data, entities } = await listBookings(P.player);
      const matches = data.bookings.filter((b) => b.courtNames.includes('Court 2') && b.provider === 'BOOKTIME');
      assert.equal(matches.length, 1, 'a booking linked to two games is listed once');
      assert.equal(matches[0].bookingRef, sharedRef, 'canonical ref = lowest geb id');
      assert.deepEqual(matches[0].linkedGameIds, [G.public, G.private].sort());
      assert.equal(entities.filter((e) => e.type === 'booking' && e.ref === sharedRef).length, 1, 'one entity');
      const other = await resolveBookingRef(P.player, `geb:${[sharedA.id, sharedB.id].sort()[1]}`);
      assert.equal(other.ref, sharedRef, 'the other link resolves to the same item');
      assert.deepEqual(other.linkedGameIds, [G.public, G.private].sort());
      tested += 5;
    }
    console.log('dedupe: ok');

    // --- canCancel: owner (connected) yes; game admin (not connected), player: no ---
    await prisma.userClubBooktimeAuth.create({
      data: { userId: P.owner.userId, clubId: club.id, externalUserId: `ext-${s}`, accessToken: 'test', refreshToken: 'test' },
    });
    {
      const owner = await listBookings(P.owner);
      const own = byExternal(owner.data, owner.entities, matrixRefs.public);
      assert.equal(own.dto?.canCancel, true, 'connected owner can cancel a Booktime booking');
      assert.equal(own.entity?.type === 'booking' && own.entity.canCancel, true);
      assert.equal(own.dto?.timeZone, 'Europe/Belgrade', 'club timezone, not home');
      assert.equal(own.dto?.localStart, formatInTimeZone(start, 'Europe/Belgrade', 'yyyy-MM-dd HH:mm'));
      assert.equal(owner.data.listComplete, false, 'Booktime without a mirror: partial list');
      assert.deepEqual(owner.data.incompleteProviders, ['BOOKTIME']);
      assert.ok(owner.entities.some((e) => e.type === 'handoff' && e.url === '/profile/connected-clubs'), 'handoff to Connected clubs');
      assert.ok(!owner.serialized.includes(`bt-matrix-public-${s}`), 'raw provider id never sent to the model');
      const admin = await listBookings(P.gameAdmin);
      assert.equal(byExternal(admin.data, admin.entities, matrixRefs.public).dto?.canCancel, false, 'not connected: no cancel');
      const player = await listBookings(P.player);
      assert.equal(byExternal(player.data, player.entities, matrixRefs.public).dto?.canCancel, false, 'player: no cancel');
      tested += 11;
    }
    console.log('canCancel + listComplete: ok');

    // --- canCancel with a booker (7c): the booker, never a connected owner of someone else's booking ---
    const byAdmin = await geb(G.public, `bt-booker-admin-${s}`, { bookedByUserId: P.gameAdmin.userId });
    const byPlayer = await geb(G.public, `bt-booker-player-${s}`, { bookedByUserId: P.player.userId });
    {
      const owner = await listBookings(P.owner);
      assert.equal(byExternal(owner.data, owner.entities, `geb:${byAdmin.id}`).dto?.canCancel, false, "connected owner can't cancel the admin's booking");
      const admin = await listBookings(P.gameAdmin);
      assert.equal(byExternal(admin.data, admin.entities, `geb:${byAdmin.id}`).dto?.canCancel, true, 'the booker can cancel (no connection check)');
      const player = await listBookings(P.player);
      assert.equal(byExternal(player.data, player.entities, `geb:${byPlayer.id}`).dto?.canCancel, true, 'a PLAYING booker can cancel');
      assert.equal(byExternal(player.data, player.entities, `geb:${byAdmin.id}`).dto?.canCancel, false, "player can't cancel the admin's booking");
      tested += 4;
    }
    console.log('canCancel booker: ok');

    // --- Nspadel link: listed, never cancellable ---
    const ns = await geb(G.public, `nspadel:${s}`, { externalBookingProvider: ClubIntegrationType.NSPADELSUPABASE });
    {
      const owner = await listBookings(P.owner);
      const item = byExternal(owner.data, owner.entities, `geb:${ns.id}`).dto;
      assert.equal(item?.provider, 'NSPADELSUPABASE');
      assert.equal(item?.canCancel, false, 'Nspadel cannot be cancelled');
      assert.ok(!owner.serialized.includes(`nspadel:${s}`), 'raw nspadel id never sent');
      tested += 3;
    }

    // --- Weltner receipts ---
    const receipt = (userId: string, startTime: string, state: WeltnerBookingState) =>
      prisma.weltnerBooking.create({
        data: {
          userId,
          clubId: club.id,
          courtId: court1.id,
          date: '2099-01-01',
          startTime,
          durationMinutes: 60,
          bookingStart: start,
          bookingEnd: end,
          state,
        },
      });
    const confirmed = await receipt(P.player.userId, '10:00', WeltnerBookingState.CONFIRMED);
    const submitting = await receipt(P.player.userId, '11:00', WeltnerBookingState.SUBMITTING);
    const rejected = await receipt(P.player.userId, '12:00', WeltnerBookingState.REJECTED);
    const strangers = await receipt(P.stranger.userId, '10:00', WeltnerBookingState.CONFIRMED);
    // The player's confirmed receipt is also linked to the public game.
    const weltnerLink = await geb(G.public, `weltner:${confirmed.id}`, { externalBookingProvider: ClubIntegrationType.WELTNER });
    {
      const player = await listBookings(P.player);
      const refs = player.data.bookings.map((b) => b.bookingRef);
      const mine = player.data.bookings.find((b) => b.bookingRef === `weltner:${confirmed.id}`);
      assert.equal(mine?.state, 'CONFIRMED');
      assert.deepEqual(mine?.linkedGameIds, [G.public], 'receipt + its game link = one item');
      assert.equal(mine?.canCancel, false, 'Weltner cannot be cancelled');
      assert.ok(!refs.includes(`geb:${weltnerLink.id}`), 'the link is folded into the receipt');
      assert.equal(player.data.bookings.find((b) => b.bookingRef === `weltner:${submitting.id}`)?.state, 'UNKNOWN', 'uncertain receipt = UNKNOWN');
      assert.ok(!refs.includes(`weltner:${rejected.id}`), 'rejected receipt never listed');
      assert.ok(!refs.includes(`weltner:${strangers.id}`), "another user's receipt never listed");
      assert.equal((await resolveBookingRef(P.player, `geb:${weltnerLink.id}`)).ref, `weltner:${confirmed.id}`);
      assert.equal(await classifyAgentOutcome(() => resolveBookingRef(P.player, `weltner:${strangers.id}`)), 'not_found');
      assert.equal(await classifyAgentOutcome(() => resolveBookingRef(P.player, `weltner:${rejected.id}`)), 'not_found');
      assert.equal(await classifyAgentOutcome(() => resolveBookingRef(P.stranger, `weltner:${confirmed.id}`)), 'not_found');

      // The owner sees the link on their game, not the receipt (it is the player's).
      const owner = await listBookings(P.owner);
      assert.ok(owner.data.bookings.some((b) => b.bookingRef === `geb:${weltnerLink.id}` && b.provider === 'WELTNER'));
      assert.ok(!owner.data.bookings.some((b) => b.bookingRef.startsWith('weltner:')));

      // The stranger sees only their own receipt; no app-listed provider → complete list, no handoff.
      const stranger = await listBookings(P.stranger);
      assert.deepEqual(stranger.data.bookings.map((b) => b.bookingRef), [`weltner:${strangers.id}`]);
      assert.equal(stranger.data.listComplete, true);
      assert.ok(!stranger.entities.some((e) => e.type === 'handoff'));
      tested += 15;
    }
    console.log('weltner receipts: ok');

    // --- past range, club filter ---
    const pastStart = new Date(Date.now() - 72 * HOUR);
    const past = await geb(G.public, `bt-past-${s}`, { bookingStart: pastStart, bookingEnd: new Date(pastStart.getTime() + HOUR) });
    const elsewhere = await geb(G.public, `bt-other-club-${s}`, { courtId: otherClub.courts[0].id });
    {
      const upcoming = await listBookings(P.owner);
      assert.ok(!upcoming.data.bookings.some((b) => b.bookingRef === `geb:${past.id}`), 'past booking not upcoming');
      const pastList = await listBookings(P.owner, { range: 'past' });
      assert.equal(pastList.data.bookings.find((b) => b.bookingRef === `geb:${past.id}`)?.state, 'PAST');
      assert.ok(pastList.data.bookings.every((b) => new Date(b.start) < new Date()), 'past list only has past bookings');
      const atClub = await listBookings(P.owner, { clubId: club.id });
      assert.ok(!atClub.data.bookings.some((b) => b.bookingRef === `geb:${elsewhere.id}`), 'club filter');
      assert.ok(atClub.data.bookings.every((b) => b.clubId === club.id));
      const atOther = await listBookings(P.owner, { clubId: otherClub.id });
      assert.deepEqual(atOther.data.bookings.map((b) => b.bookingRef), [`geb:${elsewhere.id}`]);
      assert.equal(atOther.data.listComplete, false, 'a Booktime booking at the club: partial list even without a connection');
      tested += 7;
    }
    console.log('range + club filter: ok');

    // --- link_booking_to_game / unlink_booking (7c) ---
    {
      const mkGame = async (clubId: string, isPublic: boolean, roster: [keyof typeof P, ParticipantRole, ParticipantStatus][]) => {
        const game = await prisma.game.create({
          data: {
            entityType: EntityType.GAME,
            sport: Sport.PADEL,
            gameType: GameType.CLASSIC,
            cityId: fixture.cityId,
            clubId,
            startTime: new Date(Date.now() + 24 * HOUR),
            endTime: new Date(Date.now() + 25 * HOUR),
            timeIsSet: true,
            isPublic,
            participants: { create: roster.map(([actor, role, status]) => ({ userId: P[actor].userId, role, status })) },
          },
          select: { id: true },
        });
        gameIds.push(game.id);
        return game.id;
      };
      const OWNER: [keyof typeof P, ParticipantRole, ParticipantStatus] = ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING];
      const roster: [keyof typeof P, ParticipantRole, ParticipantStatus][] = [
        OWNER,
        ['gameAdmin', ParticipantRole.ADMIN, ParticipantStatus.PLAYING],
        ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
      ];
      const gSrc = await mkGame(club.id, true, roster);
      const gLink = await mkGame(club.id, true, roster);
      const gOther = await mkGame(otherClub.id, true, [OWNER]);
      const gHidden = await mkGame(club.id, false, [OWNER]);
      const gStranger = await mkGame(club.id, true, [['stranger', ParticipantRole.OWNER, ParticipantStatus.PLAYING]]);

      // The player booked it (bookedByUserId), the owner organises both games.
      const start2 = new Date(Math.floor((Date.now() + 72 * HOUR) / 60000) * 60000);
      const end2 = new Date(start2.getTime() + HOUR);
      const src = await geb(gSrc, `bt-link-src-${s}`, {
        courtId: court2.id,
        bookingStart: start2,
        bookingEnd: end2,
        bookedByUserId: P.player.userId,
      });
      const srcRef = `geb:${src.id}`;

      let callSeq = 0;
      const hosts = new Map<string, { chatId: string; runId: string }>();
      const ctxFor = async (principal: AgentPrincipal, locale = 'en'): Promise<AgentToolContext> => {
        let host = hosts.get(principal.userId);
        if (!host) {
          const chat = await createAgentChat(principal.userId);
          chatIds.push(chat.id);
          const run = await prisma.agentRun.create({ data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED } });
          host = { chatId: chat.id, runId: run.id };
          hosts.set(principal.userId, host);
        }
        callSeq += 1;
        return { principal, locale, timezone: 'UTC', now: new Date(), runId: host.runId, chatId: host.chatId, callId: `call_b_${callSeq}` };
      };
      const tool = (name: string) => {
        const found = ALL_TOOLS.find((t) => t.name === name);
        assert.ok(found, name);
        return found;
      };
      const propose = async (name: string, principal: AgentPrincipal, args: Record<string, unknown>, locale = 'en') => {
        const definition = tool(name);
        try {
          const result = await definition.handler(await ctxFor(principal, locale), definition.input.parse(args));
          assert.ok(result.awaitingConfirmation, `${name} proposes, never executes`);
          const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
          return { result, action, plan: (action.args as { plan: unknown }).plan };
        } finally {
          await prisma.agentPendingAction.updateMany({
            where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING },
            data: { status: AgentActionStatus.EXPIRED },
          });
        }
      };
      const confirm = async (name: string, principal: AgentPrincipal, plan: unknown) => {
        const fresh = await loadAgentPrincipal(principal.userId);
        await tool(name).confirm!.authorize(fresh, plan);
        return tool(name).confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
      };
      const outcome = (name: string, principal: AgentPrincipal, args: Record<string, unknown>) =>
        classifyAgentOutcome(() => propose(name, principal, args));

      // Refusals at propose time.
      assert.equal(await outcome('link_booking_to_game', P.player, { bookingRef: srcRef, gameId: gLink }), 'forbidden', 'player (non-owner) refused');
      assert.equal(await outcome('link_booking_to_game', P.stranger, { bookingRef: `weltner:${strangers.id}`, gameId: gHidden }), 'not_found', 'hidden game → 404');
      assert.equal(await outcome('link_booking_to_game', P.owner, { bookingRef: srcRef, gameId: `missing-${s}` }), 'not_found', 'missing game → 404');
      assert.equal(await outcome('link_booking_to_game', P.stranger, { bookingRef: srcRef, gameId: gStranger }), 'not_found', "another user's booking ref → 404");
      assert.equal(await outcome('link_booking_to_game', P.owner, { bookingRef: srcRef, gameId: gOther }), 'bad_request', 'club mismatch refused');
      assert.equal(await outcome('link_booking_to_game', P.owner, { bookingRef: srcRef, gameId: gSrc }), 'bad_request', 'already linked to that game');
      assert.equal(await outcome('unlink_booking', P.owner, { bookingRef: srcRef, gameId: gLink }), 'bad_request', 'unlink: not linked to that game');
      tested += 7;

      // Strict input: the model can't pass times, courts or provider ids.
      for (const extra of [{ bookingStart: '2030-01-01T10:00:00Z' }, { courtId: court1.id }, { externalBookingId: 'x' }, { userId: P.owner.userId }]) {
        const forged = await registry.executeTool(await ctxFor(P.owner), 'link_booking_to_game', { bookingRef: srcRef, gameId: gLink, ...extra });
        assert.equal(forged.ok, false, `strict input rejects ${Object.keys(extra)[0]}`);
        tested += 1;
      }
      assert.equal(await prisma.agentPendingAction.count({ where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING } }), 0);

      // Happy path: owner links the player's booking to gLink.
      const linkProposal = await propose('link_booking_to_game', P.owner, { bookingRef: srcRef, gameId: gLink });
      const preview = linkProposal.action.preview as { title: string; lines: { label: string; to: string | null }[]; warnings: string[] };
      assert.ok(preview.lines.some((l) => l.label === AGENT_BOOKING_I18N_EN['field.booking'] && l.to?.includes('Court 2')), 'preview shows the booking');
      assert.ok(preview.warnings.some((w) => w.includes('other games')), 'preview warns the booking is shared');
      const ents = linkProposal.result.entities ?? [];
      assert.ok(ents.some((e) => e.type === 'booking') && ents.some((e) => e.type === 'game' && e.id === gLink), 'booking + game entities');
      assert.ok(!JSON.stringify(linkProposal.result.data).includes(`bt-link-src-${s}`), 'raw provider id never in the tool result');
      // Confirm-time re-check with a fresh principal: someone else can't run the owner's plan.
      assert.equal(await classifyAgentOutcome(() => tool('link_booking_to_game').confirm!.authorize(P.player, linkProposal.plan)), 'forbidden');
      assert.equal(await classifyAgentOutcome(() => tool('link_booking_to_game').confirm!.authorize(P.stranger, linkProposal.plan)), 'forbidden', 'stranger: not an organiser');
      await confirm('link_booking_to_game', P.owner, linkProposal.plan);
      const linked = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: gLink, externalBookingId: `bt-link-src-${s}` } });
      assert.equal(linked.bookingStart?.getTime(), start2.getTime(), 'start from the server row');
      assert.equal(linked.bookingEnd?.getTime(), end2.getTime(), 'end from the server row');
      assert.equal(linked.courtId, court2.id, 'court from the server row');
      assert.equal(linked.bookedByUserId, P.player.userId, 'booker kept (not overwritten by the linking owner)');
      const gLinkAfter = await prisma.game.findUniqueOrThrow({ where: { id: gLink }, select: { startTime: true, bookingStatus: true } });
      assert.equal(gLinkAfter.startTime.getTime(), start2.getTime(), 'game time follows the booking');
      assert.deepEqual((await resolveBookingRef(P.owner, srcRef)).linkedGameIds, [gSrc, gLink].sort());
      assert.equal(await outcome('link_booking_to_game', P.owner, { bookingRef: srcRef, gameId: gLink }), 'bad_request', 'linking twice refused');
      tested += 12;

      // Localized preview.
      const ru = await propose('unlink_booking', P.gameAdmin, { bookingRef: srcRef, gameId: gLink }, 'ru');
      assert.ok(/[а-я]/i.test((ru.action.preview as { title: string }).title), 'localized preview');

      // Unlink: non-owner refused; game admin unlinks; the reservation stays (row on gSrc untouched).
      assert.equal(await outcome('unlink_booking', P.player, { bookingRef: srcRef, gameId: gLink }), 'forbidden', 'player cannot unlink');
      assert.equal(await outcome('unlink_booking', P.stranger, { bookingRef: srcRef, gameId: gLink }), 'forbidden', 'stranger: not an organiser of the game');
      const unlinkProposal = await propose('unlink_booking', P.gameAdmin, { bookingRef: srcRef, gameId: gLink });
      const unlinkPreview = unlinkProposal.action.preview as { warnings: string[] };
      assert.ok(unlinkPreview.warnings.includes(AGENT_BOOKING_I18N_EN['warn.reservationStays']), 'preview: reservation at the club stays active');
      assert.ok(unlinkPreview.warnings.includes(AGENT_BOOKING_I18N_EN['warn.noBookedCourtLeft']), 'preview: last booking of the game');
      const unlinked = await confirm('unlink_booking', P.gameAdmin, unlinkProposal.plan);
      assert.ok(unlinked.message.includes('still active'));
      assert.equal(await prisma.gameExternalBooking.count({ where: { gameId: gLink } }), 0, 'unlinked from gLink');
      const srcAfter = await prisma.gameExternalBooking.findUniqueOrThrow({ where: { id: src.id } });
      assert.equal(srcAfter.bookedByUserId, P.player.userId, 'source row untouched');
      assert.equal((await prisma.game.findUniqueOrThrow({ where: { id: gLink }, select: { hasBookedCourt: true } })).hasBookedCourt, false, 'same effect as PATCH /bookings remove');
      tested += 9;

      // bookedByUserId on the HTTP services: set for a booking new to the app, inherited otherwise.
      await linkBookingToGame(gOther, P.owner.userId, false, {
        externalBookingId: `bt-http-new-${s}`,
        snapshot: { externalBookingId: `bt-http-new-${s}`, bookingStart: start2.toISOString(), bookingEnd: end2.toISOString() },
      });
      assert.equal((await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: gOther, externalBookingId: `bt-http-new-${s}` } })).bookedByUserId, P.owner.userId, 'link: new booking → acting user');
      await patchGameBookings(gOther, P.owner.userId, false, { add: [`bt-http-add-${s}`, `bt-link-src-${s}`] });
      const added = await prisma.gameExternalBooking.findMany({ where: { gameId: gOther }, select: { externalBookingId: true, bookedByUserId: true } });
      assert.equal(added.find((r) => r.externalBookingId === `bt-http-add-${s}`)?.bookedByUserId, P.owner.userId, 'PATCH add: new booking → acting user');
      assert.equal(added.find((r) => r.externalBookingId === `bt-link-src-${s}`)?.bookedByUserId, P.player.userId, 'PATCH add: known booking keeps its booker');
      await patchGameBookings(gStranger, P.stranger.userId, false, { add: [`bt-matrix-public-${s}`] });
      assert.equal(
        (await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: gStranger, externalBookingId: `bt-matrix-public-${s}` } })).bookedByUserId,
        null,
        'a legacy (null-booker) booking stays null when re-linked: re-linking never makes you the booker',
      );
      tested += 4;
    }
    console.log('link / unlink: ok');

    // --- refs and input ---
    for (const bad of ['', 'geb:', 'nspadel:abc', `mirror:${s}`, 'geb:../x', `geb:${matrixRefs.public}`]) {
      assert.equal(await classifyAgentOutcome(() => resolveBookingRef(P.owner, bad)), 'not_found', `malformed ref ${bad}`);
      tested += 1;
    }
    const forged = await registry.executeTool(
      { principal: P.stranger, locale: 'en', timezone: 'UTC', now: new Date() },
      'list_my_bookings',
      { userId: P.owner.userId },
    );
    assert.equal(forged.ok, false, 'strict input rejects an actor id');
    const tooMany = await registry.executeTool(
      { principal: P.owner, locale: 'en', timezone: 'UTC', now: new Date() },
      'list_my_bookings',
      { limit: 31 },
    );
    assert.equal(tooMany.ok, false, 'limit ≤ 30');
    const ru = await registry.executeTool(
      { principal: P.owner, locale: 'ru', timezone: 'UTC', now: new Date() },
      'list_my_bookings',
      {},
    );
    assert.ok(/[а-я]/i.test(ru.summary), 'localized summary');
    tested += 3;

    for (const [name, kind] of Object.entries(AGENT_TOOL_AUTHZ_COVERAGE)) {
      if (kind === 'booking-read-cases') {
        assert.ok(BOOKING_TOOLS.some((t) => t.name === name), `${name} (${kind}) has no cases in this test`);
      }
      if (kind === 'booking-write-cases') {
        assert.ok(BOOKING_LINK_TOOLS.some((t) => t.name === name), `${name} (${kind}) has no cases in this test`);
      }
    }
    console.log(`agentBookings.integration.test.ts: ok (${tested} cases)`);
  } finally {
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.userClubBooktimeAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
    await prisma.weltnerBooking.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('receipt cleanup failed', e));
    await fixture.cleanup().catch((e) => console.error('fixture cleanup failed', e));
    await prisma.club.deleteMany({ where: { id: { in: clubIds } } }).catch((e) => console.error('club cleanup failed', e));
    await prisma.city.deleteMany({ where: { id: { in: cityIds } } }).catch((e) => console.error('city cleanup failed', e));
  }
}

main().then(
  async () => {
    await prisma.$disconnect();
    process.exit(0);
  },
  async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  },
);
