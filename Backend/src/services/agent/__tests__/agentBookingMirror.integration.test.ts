/**
 * Slice 7k: the app-synced booking-list mirror (real dev DB, real HTTP through `app`, no LLM).
 *   - `PUT /api/bookings/mirror`: auth, strict body (no `userId`, no unknown fields), caps
 *     (bookings, courts, range, booking length), provider + club integration validation,
 *     upsert + replace inside the range (rows outside it stay), foreign court ids dropped,
 *     scoping (a user's sync never touches another user's rows);
 *   - agent: `mirror:` items in `list_my_bookings` (booker = mirror owner → `canCancel`),
 *     cancelled-only mirror rows hidden, `listComplete` only for a complete sync < 24 h
 *     (upcoming only), dedupe with a linked `geb:` row (linked ref wins, mirror CANCELLED
 *     state still shows), `resolveBookingRef` for `mirror:` (another user's → 404), and
 *     `link_booking_to_game` via a `mirror:` ref (times / court / provider id from the row).
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  AgentActionStatus,
  AgentRunStatus,
  ClubIntegrationType,
  EntityType,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  Sport,
} from '@prisma/client';
import app from '../../../app';
import prisma from '../../../config/database';
import { generateShortAccessToken } from '../../../utils/jwt';
import { classifyAgentOutcome, createAgentPermissionFixture } from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { createAgentChat } from '../agentChat.service';
import { resolveBookingRef } from '../booking/agentBookingSources';
import { BOOKING_LINK_TOOLS } from '../tools/bookingLinks.tools';
import { BOOKING_TOOLS } from '../tools/bookings.tools';
import { AgentToolRegistry, type AgentToolContext, type AgentToolDefinition } from '../tools/registry';

const TOOLS = [...BOOKING_TOOLS, ...BOOKING_LINK_TOOLS] as AgentToolDefinition[];
const registry = new AgentToolRegistry(TOOLS);
const HOUR = 60 * 60 * 1000;

type BookingDto = { bookingRef: string; provider: string; courtNames: string[]; start: string; state: string; linkedGameIds: string[]; canCancel: boolean };
type ListData = { bookings: BookingDto[]; listComplete: boolean; incompleteProviders?: string[] };

async function main(): Promise<void> {
  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const { owner, player } = fixture.principals;
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/api/bookings/mirror`;
  const cityIds: string[] = [];
  const clubIds: string[] = [];
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  let tested = 0;

  const put = async (userId: string | null, body: unknown) => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(userId ? { Authorization: `Bearer ${generateShortAccessToken({ userId })}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as { data?: { upserted: number; removed: number } } | null };
  };
  const list = async (principal: AgentPrincipal, args: Record<string, unknown> = {}) => {
    const result = await registry.executeTool(
      { principal, locale: 'en', timezone: 'UTC', now: new Date() },
      'list_my_bookings',
      { limit: 30, ...args },
    );
    assert.ok(result.ok, JSON.stringify(result.data));
    return { data: result.data as ListData, entities: result.entities ?? [] };
  };

  try {
    const city = await prisma.city.create({ data: { name: `Mirror city ${s}`, country: 'Test', timezone: 'Europe/Belgrade' } });
    cityIds.push(city.id);
    const mkClub = (name: string, integrationType: ClubIntegrationType | null) =>
      prisma.club.create({
        data: {
          name: `${name} ${s}`,
          normalizedName: `${name} ${s}`.toLowerCase(),
          address: 'Test street 1',
          cityId: city.id,
          integrationType,
          courts: { create: [{ name: 'Court 1' }, { name: 'Court 2' }] },
        },
        include: { courts: { orderBy: { name: 'asc' } } },
      });
    const club = await mkClub('Mirror club', ClubIntegrationType.BOOKTIME);
    const plainClub = await mkClub('Mirror plain club', null);
    const otherClub = await mkClub('Mirror other club', ClubIntegrationType.BOOKTIME);
    clubIds.push(club.id, plainClub.id, otherClub.id);
    const [court1] = club.courts;

    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const startA = Math.floor((now + 48 * HOUR) / 60000) * 60000;
    const booking = (id: string, startMs: number, extra: Record<string, unknown> = {}) => ({
      externalBookingId: `${id}-${s}`,
      start: iso(startMs),
      end: iso(startMs + 90 * 60 * 1000),
      courts: [{ courtId: court1.id, name: 'Court 1' }],
      ...extra,
    });
    const body = (bookings: unknown[], extra: Record<string, unknown> = {}) => ({
      provider: 'BOOKTIME',
      clubId: club.id,
      // When the app started fetching this list: each sync is a newer list than the last.
      rangeFrom: iso(Date.now()),
      rangeTo: iso(now + 60 * 24 * HOUR),
      bookings,
      ...extra,
    });

    // --- HTTP validation ---
    const valid = body([booking('a', startA)]);
    assert.equal((await put(null, valid)).status, 401, 'token required');
    const bad: [string, unknown, number][] = [
      ['weltner provider', { ...valid, provider: 'WELTNER' }, 400],
      ['nspadel provider', { ...valid, provider: 'NSPADELSUPABASE' }, 400],
      ['club without that integration', { ...valid, clubId: plainClub.id }, 400],
      ['missing club', { ...valid, clubId: `missing-${s}` }, 404],
      ['userId field (strict)', { ...valid, userId: player.userId }, 400],
      ['unknown booking field', body([{ ...booking('a', startA), price: 10 }]), 400],
      ['too many bookings', body(Array.from({ length: 101 }, (_, i) => booking(`n${i}`, startA + i * HOUR))), 400],
      ['too many courts', body([booking('a', startA, { courts: Array.from({ length: 5 }, () => ({ name: 'x' })) })]), 400],
      ['end before start', body([booking('a', startA, { end: iso(startA - HOUR) })]), 400],
      ['booking over 24 h', body([booking('a', startA, { end: iso(startA + 25 * HOUR) })]), 400],
      ['range over 400 days', body([], { rangeTo: iso(now + 401 * 24 * HOUR) }), 400],
      ['inverted range', body([], { rangeTo: iso(now - HOUR) }), 400],
      ['not an ISO date', body([booking('a', startA, { start: 'tomorrow' })]), 400],
    ];
    for (const [name, payload, want] of bad) {
      assert.equal((await put(owner.userId, payload)).status, want, name);
      tested += 1;
    }
    assert.equal(await prisma.externalBookingMirror.count({ where: { clubId: { in: clubIds } } }), 0, 'nothing written by a rejected sync');
    console.log('mirror validation: ok');

    // --- upsert + replace ---
    const past = now - 3 * HOUR; // outside [rangeFrom, rangeTo] of later syncs
    const first = await put(owner.userId, body(
      [
        booking('a', startA),
        booking('b', startA + 24 * HOUR, { courts: [{ courtId: otherClub.courts[0].id, name: 'Foreign' }] }),
        booking('c', startA + 48 * HOUR, { state: 'CANCELLED' }),
        booking('old', past),
      ],
      { rangeFrom: iso(past) },
    ));
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body?.data?.upserted, 4);
    const rowB = await prisma.externalBookingMirror.findUniqueOrThrow({
      where: { userId_provider_externalBookingId: { userId: owner.userId, provider: ClubIntegrationType.BOOKTIME, externalBookingId: `b-${s}` } },
    });
    assert.deepEqual(rowB.courts, [{ courtId: null, name: 'Foreign' }], "another club's court id is dropped, the name kept");
    const second = await put(owner.userId, body([booking('a', startA), booking('d', startA + 72 * HOUR)]));
    assert.equal(second.status, 200);
    assert.equal(second.body?.data?.removed, 2, 'b and c (inside the range, gone from the list) removed');
    const ownerIds = (await prisma.externalBookingMirror.findMany({ where: { userId: owner.userId, clubId: club.id }, select: { externalBookingId: true } }))
      .map((r) => r.externalBookingId).sort();
    assert.deepEqual(ownerIds, [`a-${s}`, `d-${s}`, `old-${s}`].sort(), 'a row outside the synced range stays');
    tested += 5;

    // --- scoping: the player's sync only touches the player's rows ---
    assert.equal((await put(player.userId, body([booking('a', startA)]))).status, 200);
    assert.equal((await put(player.userId, body([]))).status, 200);
    assert.equal(await prisma.externalBookingMirror.count({ where: { userId: owner.userId, clubId: club.id } }), 3, "the player's syncs never touch the owner's rows");
    assert.equal(await prisma.externalBookingMirror.count({ where: { userId: player.userId, clubId: club.id } }), 0);
    tested += 2;
    // --- an older list never undoes newer rows (agent booked / cancelled after the fetch began) ---
    {
      const fetchStarted = Date.now() - 60_000;
      const lateKey = { userId: owner.userId, provider: ClubIntegrationType.BOOKTIME, clubId: club.id, courts: [] };
      await prisma.externalBookingMirror.createMany({
        data: [
          { ...lateKey, externalBookingId: `late-${s}`, bookingStart: new Date(startA + 96 * HOUR), bookingEnd: new Date(startA + 97 * HOUR), syncedAt: new Date() },
          { ...lateKey, externalBookingId: `latecx-${s}`, bookingStart: new Date(startA + 98 * HOUR), bookingEnd: new Date(startA + 99 * HOUR), state: 'CANCELLED', syncedAt: new Date() },
        ],
      });
      const stale = await put(owner.userId, body(
        [booking('a', startA), booking('d', startA + 72 * HOUR), booking('latecx', startA + 98 * HOUR)],
        { rangeFrom: iso(fetchStarted) },
      ));
      assert.equal(stale.status, 200);
      const late = await prisma.externalBookingMirror.findMany({
        where: { userId: owner.userId, externalBookingId: { in: [`late-${s}`, `latecx-${s}`] } },
        orderBy: { externalBookingId: 'asc' },
      });
      assert.deepEqual(late.map((r) => [r.externalBookingId, r.state]), [[`late-${s}`, 'CONFIRMED'], [`latecx-${s}`, 'CANCELLED']], 'kept as written after the fetch began');
      await prisma.externalBookingMirror.deleteMany({ where: { id: { in: late.map((r) => r.id) } } });
      tested += 1;
    }
    console.log('mirror sync: ok');

    // --- agent list ---
    const rowOf = (id: string) =>
      prisma.externalBookingMirror.findUniqueOrThrow({
        where: { userId_provider_externalBookingId: { userId: owner.userId, provider: ClubIntegrationType.BOOKTIME, externalBookingId: `${id}-${s}` } },
      });
    const [rowA, rowD] = [await rowOf('a'), await rowOf('d')];
    await prisma.userClubBooktimeAuth.create({
      data: { userId: owner.userId, clubId: club.id, externalUserId: `ext-${s}`, accessToken: 'test', refreshToken: 'test' },
    });
    {
      const { data, entities } = await list(owner);
      const a = data.bookings.find((b) => b.bookingRef === `mirror:${rowA.id}`);
      assert.ok(a, 'mirror item listed');
      assert.equal(a.provider, 'BOOKTIME');
      assert.deepEqual(a.courtNames, ['Court 1']);
      assert.equal(a.canCancel, true, 'the mirror owner is the booker');
      assert.ok(!data.bookings.some((b) => b.bookingRef === `mirror:${rowB.id}`), 'removed row gone');
      assert.ok(!JSON.stringify(data).includes(`a-${s}`), 'raw provider id never reaches the model');
      assert.equal(data.listComplete, true, 'fresh complete sync covers the connected club');
      assert.ok(!entities.some((e) => e.type === 'handoff'), 'no handoff when covered');
      const pastList = await list(owner, { range: 'past' });
      assert.ok(pastList.data.bookings.some((b) => b.bookingRef.startsWith('mirror:')), 'past mirror row listed');
      assert.equal(pastList.data.listComplete, false, 'the app syncs upcoming lists only: past is never covered');
      tested += 9;
    }
    await prisma.externalBookingMirrorSync.updateMany({ where: { userId: owner.userId, clubId: club.id }, data: { syncedAt: new Date(now - 25 * HOUR) } });
    {
      const { data, entities } = await list(owner);
      assert.equal(data.listComplete, false, 'a sync older than 24 h no longer covers');
      assert.deepEqual(data.incompleteProviders, ['BOOKTIME']);
      assert.ok(entities.some((e) => e.type === 'handoff'), 'handoff back');
      tested += 3;
    }
    await put(owner.userId, body([booking('a', startA), booking('d', startA + 72 * HOUR)], { complete: false }));
    assert.equal((await list(owner)).data.listComplete, false, 'a truncated sync never covers');
    await put(owner.userId, body([booking('a', startA), booking('d', startA + 72 * HOUR)]));
    assert.equal((await list(owner)).data.listComplete, true);
    tested += 2;

    // --- ref resolution ---
    assert.equal((await resolveBookingRef(owner, `mirror:${rowD.id}`)).ref, `mirror:${rowD.id}`);
    assert.equal(await classifyAgentOutcome(() => resolveBookingRef(player, `mirror:${rowD.id}`)), 'not_found', "another user's mirror ref → 404");
    assert.ok(!(await list(player)).data.bookings.some((b) => b.bookingRef.startsWith('mirror:')), "the player never lists the owner's mirror");
    tested += 3;

    // --- dedupe with a linked geb row ---
    const mkGame = async (userKey: 'owner' | 'player') => {
      const game = await prisma.game.create({
        data: {
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: fixture.cityId,
          clubId: club.id,
          startTime: new Date(now + 24 * HOUR),
          endTime: new Date(now + 25 * HOUR),
          timeIsSet: true,
          isPublic: true,
          participants: {
            create: [{ userId: fixture.principals[userKey].userId, role: ParticipantRole.OWNER, status: ParticipantStatus.PLAYING }],
          },
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };
    const gA = await mkGame('owner');
    const gebA = await prisma.gameExternalBooking.create({
      data: {
        gameId: gA,
        externalBookingId: `a-${s}`,
        externalBookingProvider: ClubIntegrationType.BOOKTIME,
        courtId: court1.id,
        bookingStart: new Date(startA),
        bookingEnd: new Date(startA + 90 * 60 * 1000),
      },
    });
    {
      const { data } = await list(owner);
      const matches = data.bookings.filter((b) => b.bookingRef === `geb:${gebA.id}` || b.bookingRef === `mirror:${rowA.id}`);
      assert.equal(matches.length, 1, 'mirror + link = one item');
      assert.equal(matches[0].bookingRef, `geb:${gebA.id}`, 'the linked item wins');
      assert.deepEqual(matches[0].linkedGameIds, [gA]);
      assert.equal(matches[0].canCancel, true, 'mirror owner counts as booker on a legacy (null booker) link');
      assert.equal((await resolveBookingRef(owner, `mirror:${rowA.id}`)).ref, `geb:${gebA.id}`, 'mirror ref resolves to the linked item');
      tested += 5;
    }
    await put(owner.userId, body([booking('a', startA, { state: 'CANCELLED' }), booking('d', startA + 72 * HOUR)]));
    {
      const item = (await list(owner)).data.bookings.find((b) => b.bookingRef === `geb:${gebA.id}`);
      assert.equal(item?.state, 'CANCELLED', 'the mirror state is fresher than the link');
      assert.equal(item?.canCancel, false);
      tested += 2;
    }
    console.log('mirror agent list: ok');

    // --- link_booking_to_game via a mirror ref ---
    const gLink = await mkGame('owner');
    const gPlayer = await mkGame('player');
    const chat = await createAgentChat(owner.userId);
    const playerChat = await createAgentChat(player.userId);
    chatIds.push(chat.id, playerChat.id);
    const runFor = async (chatId: string, userId: string) =>
      (await prisma.agentRun.create({ data: { chatId, userId, status: AgentRunStatus.COMPLETED } })).id;
    const ownerRun = await runFor(chat.id, owner.userId);
    const playerRun = await runFor(playerChat.id, player.userId);
    let seq = 0;
    const ctx = (principal: AgentPrincipal): AgentToolContext => ({
      principal,
      locale: 'en',
      timezone: 'UTC',
      now: new Date(),
      runId: principal.userId === owner.userId ? ownerRun : playerRun,
      chatId: principal.userId === owner.userId ? chat.id : playerChat.id,
      callId: `call_m_${++seq}`,
    });
    const linkTool = BOOKING_LINK_TOOLS.find((t) => t.name === 'link_booking_to_game') as AgentToolDefinition;
    assert.equal(
      await classifyAgentOutcome(() => linkTool.handler(ctx(player), linkTool.input.parse({ bookingRef: `mirror:${rowD.id}`, gameId: gPlayer }))),
      'not_found',
      "linking another user's mirror ref → 404",
    );
    const proposed = await linkTool.handler(ctx(owner), linkTool.input.parse({ bookingRef: `mirror:${rowD.id}`, gameId: gLink }));
    assert.ok(proposed.awaitingConfirmation, 'link via mirror ref proposes');
    const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: proposed.awaitingConfirmation.actionId } });
    const plan = (action.args as { plan: unknown }).plan;
    await prisma.agentPendingAction.update({ where: { id: action.id }, data: { status: AgentActionStatus.EXPIRED } });
    const fresh = await loadAgentPrincipal(owner.userId);
    await linkTool.confirm!.authorize(fresh, plan);
    const done = await linkTool.confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
    const linked = await prisma.gameExternalBooking.findFirstOrThrow({ where: { gameId: gLink } });
    assert.equal(linked.externalBookingId, `d-${s}`, 'provider id from the mirror row');
    assert.equal(linked.externalBookingProvider, ClubIntegrationType.BOOKTIME);
    assert.equal(linked.courtId, court1.id, 'court from the mirror row');
    assert.equal(linked.bookingStart?.getTime(), rowD.bookingStart.getTime(), 'start from the mirror row');
    assert.equal(linked.bookingEnd?.getTime(), rowD.bookingEnd.getTime(), 'end from the mirror row');
    assert.equal(linked.bookedByUserId, owner.userId, 'the mirror owner is the booker');
    assert.equal((done.modelData as { bookingRef: string }).bookingRef, `geb:${linked.id}`, 'after linking, the linked item is canonical');
    tested += 8;
    console.log('mirror link: ok');

    console.log(`agentBookingMirror.integration.test.ts: ok (${tested} cases)`);
  } finally {
    server.close();
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    await prisma.game.deleteMany({ where: { id: { in: gameIds } } }).catch((e) => console.error('game cleanup failed', e));
    await prisma.externalBookingMirror.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('mirror cleanup failed', e));
    await prisma.externalBookingMirrorSync.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('sync cleanup failed', e));
    await prisma.userClubBooktimeAuth.deleteMany({ where: { clubId: { in: clubIds } } }).catch((e) => console.error('auth cleanup failed', e));
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
