/**
 * Phase 10 money tools, slices 10a reads and 10b-10f writes (real dev DB + the HTTP app,
 * no LLM, no run queue; docs/plans/ai-agent-money.md §10.5):
 *   - registry: the three reads are registered, `money-read-cases` coverage, strict input;
 *   - visibility: a hidden private game is the same `not_found` as a missing id;
 *     `LEAGUE_SEASON` → unavailable `season` (HTTP 404);
 *   - HTTP parity, actor × game: `get_game_cost` = `GET /games/:id/cost-shares` after the DTO
 *     mapping (players see only their own row, `total` null); `list_my_cost_balances` =
 *     `GET /transactions/owed`; `get_my_wallet` = `GET /transactions/wallet`;
 *   - no payment handles in any money output (method ids only);
 *   - authorization before sync: a stranger's call creates no rows and stamps no payer;
 *   - the payer alone can't view; a payer who plays sees every row;
 *   - league: the season owner (not on the fixture) views a NOT_KNOWN fixture split by the
 *     season price (`priceSource: 'season'`); `get_game` shows the season price;
 *   - trainer: no share, can confirm and remind;
 *   - locks: frozen ledger reads `frozen`; FINAL > 7 days with no rows → `too_old`, no rows;
 *   - unavailable reasons: free / per_team / no_price.
 * Writes (`mark_my_share_paid`, `confirm_share_received`):
 *   - standard tier, strict input, hidden = missing;
 *   - actor matrix at propose + confirm equals `POST …/cost-shares/me/paid` and
 *     `POST …/cost-shares/:userId/confirm` (status and resulting row);
 *   - the payer can't mark their own share; a plain player or stranger can't confirm; a payer
 *     who only plays, the trainer, the league season owner and a platform admin can;
 *   - stale cards (state, price / re-split, payer) close `failed: {changed: false}`, rows untouched;
 *     a role lost between propose and confirm → 403, nothing written;
 *   - undo, coin-paid rows refused, no-op refused; a frozen ledger still marks and confirms;
 *   - one pending card at a time; a tainted run never auto-approves; ALWAYS_ALLOW does otherwise.
 * Writes 10d-10f:
 *   - `pay_my_share_with_coins` (critical): actor matrix = `POST …/me/paid {method:'COINS'}`
 *     (row, transaction, coins moved); the card's share / coins / payer / balance / rate; double
 *     confirm moves coins once; not enough coins at propose (no card) or at confirm (FAILED,
 *     claim handed back); stale on re-split or a rate change; the service's `expect` refuses any
 *     mismatch with 409; ALWAYS_ALLOW refused and a forged row never auto-approves; rate unset →
 *     refused. `COINS_PER_CURRENCY_UNIT` is set only inside one try/finally and restored.
 *   - `set_game_price`: actor matrix = `PUT /games/:id` (price and split); card from → to and
 *     "about X each"; validation; escalation to critical (paid share, coin share, currency change,
 *     split removed) and escalated calls never auto-approve; results started / archived refused
 *     (also between propose and confirm); league fixture and season refused with a handoff;
 *     stale on a moved price or a newly paid share; lost role → 403.
 *   - `remind_unpaid_shares`: actor matrix = `POST …/cost-shares/remind`; the card lists who is
 *     reminded; the 24 h cooldown refuses without a card and FAILS a raced confirm with the next
 *     time; stale when the unpaid set changes; stranger writes nothing; frozen 10-day-old game
 *     still allowed (no age limit); trainer; lost role → 403.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import {
  AgentActionStatus,
  AgentRunStatus,
  AgentToolPermissionMode,
  EntityType,
  GameStatus,
  GameType,
  ParticipantRole,
  ParticipantStatus,
  ResultsStatus,
  Sport,
  type Prisma,
} from '@prisma/client';
import type { AgentActionPreview } from '@bandeja/shared/agentContract';
import app from '../../../app';
import prisma from '../../../config/database';
import { ApiError } from '../../../utils/ApiError';
import { generateShortAccessToken } from '../../../utils/jwt';
import { getRemindAvailableAt, remindUnpaidShares } from '../../gameCost/costShareReminder.service';
import { getGameCostSummary, markOwnShareAsPaid } from '../../gameCost/gameCost.service';
import {
  getNumericSetting,
  getSetting,
  invalidateSettingsCache,
  PLATFORM_SETTING_KEYS,
  setSetting,
} from '../../platformSetting.service';
import { createAgentPermissionFixture, type AgentMatrixActor } from '../access/__tests__/agentPermissionMatrix';
import { loadAgentPrincipal, type AgentPrincipal } from '../access/agentPrincipal';
import { autoApproveAgentAction } from '../agentActionAutoApprove';
import { createAgentChat } from '../agentChat.service';
import { AgentToolPermissionService } from '../agentToolPermission.service';
import { AGENT_MONEY_I18N_EN as EN } from '../i18n/agentMoneyI18n';
import { AGENT_TOOL_DEFINITIONS, getAgentToolRegistry } from '../tools';
import { AGENT_TOOL_AUTHZ_COVERAGE } from '../tools/__tests__/agentToolCoverage';
import type { AgentToolContext } from '../tools/registry';

const registry = getAgentToolRegistry();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MONEY_READS = ['list_my_cost_balances', 'get_game_cost', 'get_my_wallet'] as const;
const PHONE_HANDLE = '+34600111222';

type Json = Record<string, unknown>;
type HttpShare = { userId: string; amountMinor: number; state: string; method: string; isPayer: boolean; isOverridden: boolean };
type HttpSummary = {
  available: boolean;
  totalMinor: number | null;
  outstandingMinor: number | null;
  currency: string | null;
  payerUserId: string | null;
  frozenAt: string | null;
  estimated: boolean;
  shares: HttpShare[];
  settledCount: number;
  shareCount: number;
  viewerShare: HttpShare | null;
  paymentMethods: { method: string; handle: string | null }[];
  canManage: boolean;
  canConfirm: boolean;
  canRemind: boolean;
  viewerCoinCost: number | null;
  viewerCoinBalance: number | null;
  remindAvailableAt: string | null;
};
type AgentShare = { player: { userId: string }; amountMinor: number; amount: string; state: string; method: string; isPayer: boolean; isOverridden: boolean };
type AgentCost = {
  available: boolean;
  reason?: string;
  priceSource: string;
  currency?: string;
  total?: { amountMinor: number } | null;
  outstanding?: { amountMinor: number } | null;
  payer?: { userId: string } | null;
  frozen?: boolean;
  estimated?: boolean;
  shares?: AgentShare[];
  settledCount?: number;
  shareCount?: number;
  myShare?: AgentShare | null;
  paymentMethodIds?: string[];
  myActions?: Json;
  appLink?: string;
};
type OwedRow = { gameId: string; title?: string | null; amountMinor: number; currency: string; state: string; counterpartyUserId?: string | null; counterparty?: { userId: string } | null };

async function main(): Promise<void> {
  // --- registry --------------------------------------------------------------------------
  for (const name of MONEY_READS) {
    const tool = registry.get(name);
    assert.ok(tool, `${name} registered`);
    assert.ok(AGENT_TOOL_DEFINITIONS.includes(tool));
    assert.equal(tool.kind, 'read');
    assert.equal(tool.scope, 'user');
    assert.equal(tool.riskTier, undefined);
    assert.equal(tool.untrustedContent, undefined);
    assert.equal(AGENT_TOOL_AUTHZ_COVERAGE[name], 'money-read-cases');
    for (const bad of [{ userId: 'x' }, { gameId: 'g', userId: 'x' }, { extra: 1 }]) {
      assert.equal(tool.input.safeParse(bad).success, false, `${name} rejects ${JSON.stringify(bad)}`);
    }
  }
  assert.equal(registry.get('get_game_cost')!.input.safeParse({ gameId: 'g' }).success, true);
  assert.equal(registry.get('list_my_cost_balances')!.input.safeParse({ direction: 'sideways' }).success, false);
  assert.equal(registry.get('get_my_wallet')!.input.safeParse({}).success, true);
  console.log('registry: ok');

  const fixture = await createAgentPermissionFixture();
  const s = fixture.suffix;
  const P = fixture.principals;
  const G = fixture.games;
  const gameIds: string[] = [];
  const chatIds: string[] = [];
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  try {
    const ctx = (principal: AgentPrincipal, locale = 'en'): AgentToolContext => ({ principal, locale, timezone: 'UTC', now: new Date() });
    const call = (name: string, principal: AgentPrincipal, args: Json = {}, locale = 'en') =>
      registry.executeTool(ctx(principal, locale), name, args);
    const http = async (userId: string, path: string) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}` },
      });
      const json = (await res.json().catch(() => null)) as { data?: unknown } | null;
      return { status: res.status, data: json?.data };
    };
    const shareRows = (gameId: string) => prisma.gameCostShare.count({ where: { gameId } });
    const assertNoHandles = (data: unknown, label: string) => {
      const text = JSON.stringify(data);
      assert.ok(!text.includes(PHONE_HANDLE.slice(3)), `${label}: no payment handle`);
      assert.ok(!/"handle"|"paymentHint"|"paymentMethods"/.test(text), `${label}: no payment fields`);
    };

    type Roster = [AgentMatrixActor, ParticipantRole, ParticipantStatus][];
    const STANDARD: Roster = [
      ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING],
      ['gameAdmin', ParticipantRole.ADMIN, ParticipantStatus.PLAYING],
      ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
      ['queued', ParticipantRole.PARTICIPANT, ParticipantStatus.IN_QUEUE],
      ['invited', ParticipantRole.PARTICIPANT, ParticipantStatus.INVITED],
    ];
    const mkGame = async (name: string, data: Partial<Prisma.GameUncheckedCreateInput>, roster: Roster = STANDARD) => {
      const game = await prisma.game.create({
        data: {
          name: `${name} ${s}`,
          entityType: EntityType.GAME,
          sport: Sport.PADEL,
          gameType: GameType.CLASSIC,
          cityId: fixture.cityId,
          startTime: new Date(Date.now() + DAY),
          endTime: new Date(Date.now() + DAY + 90 * 60 * 1000),
          timeIsSet: true,
          isPublic: true,
          maxParticipants: 4,
          ...data,
          participants: {
            create: roster.map(([actor, role, status]) => ({
              userId: P[actor].userId,
              role,
              status,
              ...(status === ParticipantStatus.INVITED ? { invitedByUserId: P.owner.userId } : {}),
            })),
          },
        },
        select: { id: true },
      });
      gameIds.push(game.id);
      return game.id;
    };
    const PRICE_40 = {
      priceType: 'TOTAL',
      priceTotal: 40,
      priceCurrency: 'EUR',
      paymentMethods: [{ method: 'BIZUM', handle: PHONE_HANDLE }, { method: 'CASH', handle: null }],
    } as const satisfies Partial<Prisma.GameUncheckedCreateInput>;

    // --- authorization before sync -------------------------------------------------------
    {
      const fresh = await mkGame('Fresh priced', PRICE_40);
      for (const actor of ['stranger', 'queued', 'invited', 'leagueOwner'] as const) {
        const result = await call('get_game_cost', P[actor], { gameId: fresh });
        assert.equal(result.ok, false, `${actor} can't view the split`);
        assert.equal((result.data as Json).error, 'forbidden', `${actor}: forbidden`);
      }
      assert.equal(await shareRows(fresh), 0, 'a refused read creates no rows');
      const row = await prisma.game.findUnique({ where: { id: fresh }, select: { costPayerId: true } });
      assert.equal(row?.costPayerId, null, 'a refused read stamps no payer');
      console.log('authorize before sync: ok');
    }

    // --- visibility + HTTP parity matrix (reads) ----------------------------------------
    await prisma.game.update({ where: { id: G.public }, data: PRICE_40 });
    await prisma.game.update({ where: { id: G.private }, data: PRICE_40 });

    const missing = await call('get_game_cost', P.player, { gameId: `missing-${s}` });
    assert.equal(missing.ok, false);
    const hidden = await call('get_game_cost', P.stranger, { gameId: G.private });
    assert.deepEqual(hidden.data, missing.data, 'hidden private game = missing id');
    assert.equal(hidden.summary, missing.summary);
    assert.deepEqual(hidden.data, { error: 'not_found' });

    const toAgentShape = (share: HttpShare) => ({
      userId: share.userId,
      amountMinor: share.amountMinor,
      state: share.state,
      method: share.method,
      isPayer: share.isPayer,
      isOverridden: share.isOverridden,
    });
    const fromAgentShare = (share: AgentShare) => ({
      userId: share.player.userId,
      amountMinor: share.amountMinor,
      state: share.state,
      method: share.method,
      isPayer: share.isPayer,
      isOverridden: share.isOverridden,
    });
    const assertCostParity = (agent: AgentCost, dto: HttpSummary, label: string) => {
      assert.equal(agent.available, dto.available, `${label}: available`);
      assert.equal(agent.currency, dto.currency, `${label}: currency`);
      assert.equal(agent.total?.amountMinor ?? null, dto.totalMinor, `${label}: total`);
      assert.equal(agent.outstanding?.amountMinor ?? null, dto.outstandingMinor, `${label}: outstanding`);
      assert.equal(agent.payer?.userId ?? null, dto.payerUserId, `${label}: payer`);
      assert.equal(agent.frozen, dto.frozenAt != null, `${label}: frozen`);
      assert.equal(agent.estimated, dto.estimated, `${label}: estimated`);
      assert.deepEqual(agent.shares!.map(fromAgentShare), dto.shares.map(toAgentShape), `${label}: shares (projected)`);
      assert.equal(agent.settledCount, dto.settledCount, `${label}: settledCount`);
      assert.equal(agent.shareCount, dto.shareCount, `${label}: shareCount`);
      assert.deepEqual(agent.myShare ? fromAgentShare(agent.myShare) : null, dto.viewerShare ? toAgentShape(dto.viewerShare) : null, `${label}: myShare`);
      assert.deepEqual(agent.paymentMethodIds, dto.paymentMethods.map((m) => m.method), `${label}: method ids`);
      const actions = agent.myActions!;
      assert.equal(actions.canConfirm, dto.canConfirm, `${label}: canConfirm`);
      assert.equal(actions.canRemind, dto.canRemind, `${label}: canRemind`);
      assert.equal(actions.canManage, dto.canManage, `${label}: canManage`);
      assert.equal(actions.coinCost, dto.viewerCoinCost, `${label}: coinCost`);
      assert.equal(actions.coinBalance, dto.viewerCoinBalance, `${label}: coinBalance`);
      assert.equal(actions.remindAvailableAt, dto.remindAvailableAt, `${label}: remindAvailableAt`);
    };

    // stranger invited queued player gameAdmin owner leagueOwner globalAdmin
    const MATRIX: Record<'public' | 'private', string> = {
      public: 'F F F A A A F A',
      private: 'N F F A A A N A',
    };
    const ACTORS: AgentMatrixActor[] = ['stranger', 'invited', 'queued', 'player', 'gameAdmin', 'owner', 'leagueOwner', 'globalAdmin'];
    let sawHandleOverHttp = false;
    for (const key of ['public', 'private'] as const) {
      const letters = MATRIX[key].split(' ');
      for (const [index, actor] of ACTORS.entries()) {
        const gameId = G[key];
        const result = await call('get_game_cost', P[actor], { gameId });
        const res = await http(P[actor].userId, `/games/${gameId}/cost-shares`);
        const label = `${key}/${actor}`;
        const expected = letters[index];
        if (expected === 'A') {
          assert.equal(result.ok, true, `${label}: allowed (${JSON.stringify(result.data)})`);
          assert.equal(res.status, 200, `${label}: HTTP 200`);
          const agent = result.data as AgentCost;
          const dto = res.data as HttpSummary;
          assertCostParity(agent, dto, label);
          assertNoHandles(result.data, label);
          if (dto.paymentMethods.some((m) => m.handle?.includes(PHONE_HANDLE.slice(3)))) sawHandleOverHttp = true;
          const isPlayerOnly = actor === 'player';
          assert.equal(agent.total == null, isPlayerOnly, `${label}: total hidden only for a plain player`);
          assert.equal(agent.shares!.length, isPlayerOnly ? 1 : 3, `${label}: projected rows`);
          assert.ok(agent.appLink?.startsWith(`/games/${gameId}?section=cost`), `${label}: app link`);
          assert.ok(result.entities?.some((e) => e.type === 'handoff' && e.url === agent.appLink), `${label}: handoff entity`);
        } else if (expected === 'F') {
          assert.equal((result.data as Json).error, 'forbidden', `${label}: forbidden`);
          assert.equal(res.status, 403, `${label}: HTTP 403`);
        } else {
          assert.deepEqual(result.data, { error: 'not_found' }, `${label}: not found`);
          assert.ok(res.status === 403 || res.status === 404, `${label}: HTTP refuses too (${res.status})`);
        }
      }
    }
    assert.ok(sawHandleOverHttp, 'the HTTP DTO carries the handle, so the no-handle check is meaningful');
    {
      const asPlayer = (await call('get_game_cost', P.player, { gameId: G.public })).data as AgentCost;
      assert.equal(asPlayer.myShare?.amountMinor, 1333, 'player share 40 € / 3, floored');
      assert.equal(asPlayer.myShare?.amount, '€13.33', 'server-formatted amount');
      assert.equal(asPlayer.myActions?.canMarkPaid, true);
      assert.equal(asPlayer.appLink, `/games/${G.public}?section=cost&settle=1`, 'debtor gets the settle link');
      const asOwner = (await call('get_game_cost', P.owner, { gameId: G.public })).data as AgentCost;
      assert.equal(asOwner.total?.amountMinor, 4000);
      assert.equal(asOwner.myShare?.isPayer, true);
      assert.equal(asOwner.myActions?.canMarkPaid, false, 'the payer never marks their own share');
      assert.equal(asOwner.appLink, `/games/${G.public}?section=cost`);
      const localized = await call('get_game_cost', P.player, { gameId: G.public }, 'ru');
      assert.ok(localized.summary.includes('из'), 'summary localized');
    }
    console.log('get_game_cost parity matrix: ok');

    // --- payer rules ---------------------------------------------------------------------
    {
      // A payer who plays but doesn't organize sees every row.
      const payerGame = await mkGame('Player pays', { ...PRICE_40, costPayerId: P.player.userId });
      const agent = (await call('get_game_cost', P.player, { gameId: payerGame })).data as AgentCost;
      const dto = (await http(P.player.userId, `/games/${payerGame}/cost-shares`)).data as HttpSummary;
      assertCostParity(agent, dto, 'payer player');
      assert.equal(agent.shares!.length, 3, 'the payer sees every row');
      assert.equal(agent.myActions?.canConfirm, true);
      // Being the payer alone is not enough to view.
      const outsiderPays = await mkGame('Outsider pays', { ...PRICE_40, costPayerId: P.leagueOwner.userId });
      const refused = await call('get_game_cost', P.leagueOwner, { gameId: outsiderPays });
      assert.equal((refused.data as Json).error, 'forbidden', 'payer who is not on the game');
      assert.equal((await http(P.leagueOwner.userId, `/games/${outsiderPays}/cost-shares`)).status, 403);
      console.log('payer rules: ok');
    }

    // --- trainer -------------------------------------------------------------------------
    {
      const training = await mkGame(
        'Training',
        { ...PRICE_40, entityType: EntityType.TRAINING, trainerId: P.invited.userId },
        [
          ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING],
          ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
          ['invited', ParticipantRole.ADMIN, ParticipantStatus.NON_PLAYING],
        ],
      );
      const agent = (await call('get_game_cost', P.invited, { gameId: training })).data as AgentCost;
      const dto = (await http(P.invited.userId, `/games/${training}/cost-shares`)).data as HttpSummary;
      assertCostParity(agent, dto, 'trainer');
      assert.equal(agent.myShare, null, 'the trainer has no share');
      assert.equal(agent.shares!.length, 2, 'only PLAYING participants owe');
      assert.ok(!agent.shares!.some((share) => share.player.userId === P.invited.userId));
      assert.equal(agent.myActions?.canConfirm, true, 'trainer (admin) can confirm');
      assert.equal(agent.myActions?.canRemind, true, 'trainer (admin) can remind');
      assert.equal(agent.myActions?.canMarkPaid, false);
      console.log('trainer: ok');
    }

    // --- league: season price, season owner, LEAGUE_SEASON -------------------------------
    {
      const season = await mkGame(
        'Season',
        { entityType: EntityType.LEAGUE_SEASON, isPublic: false, priceType: 'PER_PERSON', priceTotal: 10, priceCurrency: 'EUR' },
        [['leagueOwner', ParticipantRole.OWNER, ParticipantStatus.NON_PLAYING]],
      );
      const fixtureGame = await mkGame(
        'Fixture',
        { entityType: EntityType.LEAGUE, parentId: season, priceType: 'NOT_KNOWN' },
        [
          ['owner', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
          ['gameAdmin', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
          ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
        ],
      );
      const agent = (await call('get_game_cost', P.leagueOwner, { gameId: fixtureGame })).data as AgentCost;
      const dto = (await http(P.leagueOwner.userId, `/games/${fixtureGame}/cost-shares`)).data as HttpSummary;
      assertCostParity(agent, dto, 'season owner on fixture');
      assert.equal(agent.priceSource, 'season');
      assert.equal(agent.total?.amountMinor, 3000, '3 players × 10 € season price');
      assert.equal(agent.payer?.userId, P.leagueOwner.userId, 'season owner pays by default');
      assert.equal(agent.myActions?.canConfirm, true);
      assert.equal(agent.myActions?.canRemind, true);

      const game = (await call('get_game', P.player, { gameId: fixtureGame })).data as { price: Json };
      assert.deepEqual(game.price, { amount: 10, type: 'PER_PERSON', currency: 'EUR', priceSource: 'season' }, 'get_game shows the season price');
      const plain = (await call('get_game', P.player, { gameId: G.public })).data as { price: Json };
      assert.deepEqual(plain.price, { amount: 40, type: 'TOTAL', currency: 'EUR', priceSource: 'game' });

      const seasonCost = await call('get_game_cost', P.leagueOwner, { gameId: season });
      assert.equal(seasonCost.ok, true);
      assert.equal((seasonCost.data as AgentCost).available, false);
      assert.equal((seasonCost.data as AgentCost).reason, 'season');
      assert.equal(seasonCost.summary, EN['summary.gameCostUnavailable'].replace('{{game}}', `Season ${s}`));
      assert.equal((await http(P.leagueOwner.userId, `/games/${season}/cost-shares`)).status, 404, 'HTTP: no ledger on a season');
      assert.equal(await shareRows(season), 0);
      console.log('league: ok');
    }

    // --- locks: frozen, 7-day guard ------------------------------------------------------
    {
      const frozen = await mkGame('Frozen', PRICE_40);
      await call('get_game_cost', P.owner, { gameId: frozen });
      await prisma.game.update({ where: { id: frozen }, data: { costFrozenAt: new Date(), resultsStatus: ResultsStatus.FINAL } });
      const agent = (await call('get_game_cost', P.owner, { gameId: frozen })).data as AgentCost;
      const dto = (await http(P.owner.userId, `/games/${frozen}/cost-shares`)).data as HttpSummary;
      assertCostParity(agent, dto, 'frozen');
      assert.equal(agent.frozen, true);
      assert.equal(agent.estimated, false);

      const old = await mkGame('Old final', {
        ...PRICE_40,
        resultsStatus: ResultsStatus.FINAL,
        startTime: new Date(Date.now() - 10 * DAY - 2 * HOUR),
        endTime: new Date(Date.now() - 10 * DAY),
      });
      const tooOld = await call('get_game_cost', P.owner, { gameId: old });
      assert.equal(tooOld.ok, true);
      assert.equal((tooOld.data as AgentCost).available, false);
      assert.equal((tooOld.data as AgentCost).reason, 'too_old');
      assert.equal(await shareRows(old), 0, 'no ledger is created retroactively');
      console.log('locks: ok');
    }

    // --- unavailable reasons -------------------------------------------------------------
    for (const [data, reason] of [
      [{ priceType: 'FREE' }, 'free'],
      [{ priceType: 'PER_TEAM', priceTotal: 20, priceCurrency: 'EUR' }, 'per_team'],
      [{ priceType: 'NOT_KNOWN' }, 'no_price'],
      [{ priceType: 'TOTAL', priceTotal: 40 }, 'no_price'],
    ] as const) {
      const gameId = await mkGame(`Reason ${reason}`, data as Partial<Prisma.GameUncheckedCreateInput>);
      const result = await call('get_game_cost', P.player, { gameId });
      assert.equal(result.ok, true);
      assert.equal((result.data as AgentCost).available, false);
      assert.equal((result.data as AgentCost).reason, reason, `${JSON.stringify(data)} → ${reason}`);
      assert.equal(await shareRows(gameId), 0);
    }
    console.log('unavailable reasons: ok');

    // --- list_my_cost_balances = GET /transactions/owed ----------------------------------
    for (const actor of ['player', 'owner', 'gameAdmin', 'leagueOwner', 'stranger', 'globalAdmin'] as const) {
      const res = await http(P[actor].userId, '/transactions/owed');
      assert.equal(res.status, 200);
      const owed = res.data as { owed: OwedRow[]; owedToMe: OwedRow[] };
      const result = await call('list_my_cost_balances', P[actor]);
      assert.equal(result.ok, true, `${actor}: list`);
      const data = result.data as { owed: { rows: OwedRow[]; totals: { currency: string; amountMinor: number }[]; truncated: boolean }; owedToMe: { rows: OwedRow[] } };
      const shape = (rows: OwedRow[]) =>
        rows.map((row) => ({
          gameId: row.gameId,
          amountMinor: row.amountMinor,
          currency: row.currency,
          state: row.state,
          counterparty: row.counterpartyUserId ?? row.counterparty?.userId ?? null,
        }));
      assert.deepEqual(shape(data.owed.rows), shape(owed.owed), `${actor}: owed parity`);
      assert.deepEqual(shape(data.owedToMe.rows), shape(owed.owedToMe), `${actor}: owedToMe parity`);
      const eur = owed.owed.filter((row) => row.currency === 'EUR').reduce((sum, row) => sum + row.amountMinor, 0);
      assert.deepEqual(
        data.owed.totals.map((t) => [t.currency, t.amountMinor]),
        eur ? [['EUR', eur]] : [],
        `${actor}: server-summed totals`,
      );
      assert.equal(data.owed.truncated, false);
      assertNoHandles(result.data, `${actor} balances`);
    }
    {
      const player = (await call('list_my_cost_balances', P.player)).data as { owed: { rows: OwedRow[] }; owedToMe: { rows: OwedRow[] } };
      assert.ok(player.owed.rows.length >= 4, 'the player owes on several games');
      assert.ok(player.owed.rows.every((row) => row.state === 'UNPAID'));
      assert.ok(player.owedToMe.rows.length === 2, 'owed to the player on the game they pay for');
      const owedOnly = await call('list_my_cost_balances', P.player, { direction: 'owed' });
      assert.equal((owedOnly.data as Json).owedToMe, undefined);
      assert.equal(owedOnly.summary, EN['summary.balancesOwed'].replace('{{count}}', String(player.owed.rows.length)));
      const leagueOwner = (await call('list_my_cost_balances', P.leagueOwner, { direction: 'owed_to_me' })).data as { owedToMe: { rows: OwedRow[] } };
      assert.equal(leagueOwner.owedToMe.rows.length, 3, 'season owner is owed on the fixture');
      assert.ok(leagueOwner.owedToMe.rows.every((row) => row.title?.startsWith('Fixture')));
    }
    console.log('list_my_cost_balances parity: ok');

    // --- get_my_wallet = GET /transactions/wallet ----------------------------------------
    await prisma.user.update({ where: { id: P.player.userId }, data: { wallet: 1234 } });
    const rate = await getNumericSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);
    for (const actor of ['player', 'stranger'] as const) {
      const res = await http(P[actor].userId, '/transactions/wallet');
      assert.equal(res.status, 200);
      const result = await call('get_my_wallet', P[actor]);
      assert.equal(result.ok, true);
      const data = result.data as { coins: number; coinsForCostShares: boolean };
      assert.equal(data.coins, (res.data as { wallet: number }).wallet, `${actor}: wallet parity`);
      assert.equal(data.coinsForCostShares, rate != null);
      assert.deepEqual(Object.keys(data).sort(), ['coins', 'coinsForCostShares', 'note'], 'no history, no user fields');
    }
    assert.equal(((await call('get_my_wallet', P.player)).data as { coins: number }).coins, 1234);
    console.log('get_my_wallet parity: ok');

    // =========================================================================================
    // Slices 10b / 10c: mark_my_share_paid, confirm_share_received
    // =========================================================================================
    let callSeq = 0;
    const hosts = new Map<string, { chatId: string; runId: string }>();
    const writeCtx = async (principal: AgentPrincipal, locale = 'en'): Promise<AgentToolContext> => {
      let host = hosts.get(principal.userId);
      if (!host) {
        const chat = await createAgentChat(principal.userId);
        chatIds.push(chat.id);
        const run = await prisma.agentRun.create({ data: { chatId: chat.id, userId: principal.userId, status: AgentRunStatus.COMPLETED } });
        host = { chatId: chat.id, runId: run.id };
        hosts.set(principal.userId, host);
      }
      callSeq += 1;
      return { principal, locale, timezone: 'UTC', now: new Date(), runId: host.runId, chatId: host.chatId, callId: `call_money_${callSeq}` };
    };
    const expirePending = () =>
      prisma.agentPendingAction.updateMany({ where: { chatId: { in: chatIds }, status: AgentActionStatus.PENDING }, data: { status: AgentActionStatus.EXPIRED } });
    type WriteName = 'mark_my_share_paid' | 'confirm_share_received' | 'pay_my_share_with_coins' | 'set_game_price' | 'remind_unpaid_shares';
    /** Through the registry (tier, not_found mapping); returns the card or the non-card result. */
    const proposeCall = async (name: WriteName, principal: AgentPrincipal, args: Json, locale = 'en') => {
      try {
        const result = await registry.executeTool(await writeCtx(principal, locale), name, args);
        if (!result.awaitingConfirmation) return { result, plan: null, preview: null, tier: null };
        const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: result.awaitingConfirmation.actionId } });
        const stored = action.args as { plan: unknown; riskTier?: string };
        // Static tiers; `set_game_price` escalates per call, so its cases check `tier` themselves.
        if (name === 'pay_my_share_with_coins') assert.equal(stored.riskTier, 'critical', `${name}: critical tier`);
        else if (name !== 'set_game_price') assert.equal(stored.riskTier, 'standard', `${name}: standard tier`);
        return { result, plan: stored.plan, preview: action.preview as unknown as AgentActionPreview, tier: stored.riskTier };
      } finally {
        await expirePending();
      }
    };
    const propose = async (name: WriteName, principal: AgentPrincipal, args: Json, locale = 'en') => {
      const out = await proposeCall(name, principal, args, locale);
      assert.ok(out.plan && out.preview, `${name} proposes: ${JSON.stringify(out.result.data)}`);
      return { plan: out.plan, preview: out.preview };
    };
    /** The confirm tap: fresh principal → authorize → execute (`agentActionExecute.ts`). */
    const confirm = async (name: WriteName, principal: AgentPrincipal, plan: unknown) => {
      const tool = registry.get(name)!;
      const fresh = await loadAgentPrincipal(principal.userId);
      await tool.confirm!.authorize(fresh, plan);
      return tool.confirm!.execute({ principal: fresh, locale: 'en', timezone: 'UTC', now: new Date() }, plan);
    };
    const statusOf = async (run: () => Promise<unknown>): Promise<number> => {
      try {
        await run();
        return 200;
      } catch (error) {
        if (error instanceof ApiError) return error.statusCode;
        throw error;
      }
    };
    const post = async (userId: string, path: string, body: unknown = {}) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { data?: unknown; message?: string } | null;
      return { status: res.status, data: json?.data, message: json?.message };
    };
    const shareRow = (gameId: string, userId: string) =>
      prisma.gameCostShare.findUnique({
        where: { gameId_userId: { gameId, userId } },
        select: { amountCents: true, markedPaidAt: true, confirmedAt: true, method: true },
      });
    const shareState = async (gameId: string, userId: string) => {
      const row = await shareRow(gameId, userId);
      if (!row) return null;
      return { state: row.confirmedAt ? 'SETTLED' : row.markedPaidAt ? 'MARKED_PAID' : 'UNPAID', method: row.method };
    };
    const ledger = async (gameId: string) =>
      (await prisma.gameCostShare.findMany({
        where: { gameId },
        orderBy: { userId: 'asc' },
        select: { userId: true, amountCents: true, markedPaidAt: true, confirmedAt: true, method: true },
      })).map((row) => JSON.stringify(row));
    /** Ledger rows exist (the synced read), as the app would have after opening the game. */
    const priced = async (name: string, data: Partial<Prisma.GameUncheckedCreateInput> = {}) => {
      const gameId = await mkGame(name, { ...PRICE_40, ...data });
      await getGameCostSummary(gameId, P.owner.userId);
      return gameId;
    };
    /** A player's display name as the money tools show it (the service's user card). */
    const nameIn = async (gameId: string, userId: string) => {
      const cost = (await call('get_game_cost', P.owner, { gameId })).data as { shares: { player: { userId: string; name: string } }[] };
      return cost.shares.find((share) => share.player.userId === userId)!.player.name;
    };
    const warnings = (preview: AgentActionPreview) => preview.warnings ?? [];
    const lineTo = (preview: AgentActionPreview, label: string) => preview.lines.find((l) => l.label === label);
    const err = (result: { data: unknown }) => (result.data as Json).error;
    const t = (key: keyof typeof EN, vars: Record<string, string> = {}) =>
      Object.entries(vars).reduce<string>((text, [k, v]) => text.replace(`{{${k}}}`, v), EN[key]);

    // --- registry (writes) -----------------------------------------------------------------
    for (const name of ['mark_my_share_paid', 'confirm_share_received'] as const) {
      const tool = registry.get(name);
      assert.ok(tool && AGENT_TOOL_DEFINITIONS.includes(tool), `${name} registered`);
      assert.equal(tool.kind, 'write');
      assert.equal(tool.riskTier, 'standard');
      assert.equal(tool.scope, 'user');
      assert.ok(tool.promptHint, `${name}: promptHint`);
      assert.equal(AGENT_TOOL_AUTHZ_COVERAGE[name], 'money-write-cases');
      for (const bad of [{ gameId: 'g', userId: 'x' }, { gameId: 'g', extra: 1 }]) {
        assert.equal(tool.input.safeParse(bad).success, false, `${name} rejects ${JSON.stringify(bad)}`);
      }
    }
    assert.equal(registry.get('confirm_share_received')!.input.safeParse({ gameId: 'g' }).success, false, 'playerId required');
    assert.deepEqual(registry.get('confirm_share_received')!.input.parse({ gameId: 'g', playerId: 'p' }), { gameId: 'g', playerId: 'p', received: true });
    console.log('registry (writes): ok');

    // --- visibility: hidden = missing -------------------------------------------------------
    {
      for (const [name, args] of [
        ['mark_my_share_paid', {}],
        ['confirm_share_received', { playerId: P.player.userId }],
      ] as const) {
        const missingW = await proposeCall(name, P.stranger, { gameId: `missing-${s}`, ...args });
        const hiddenW = await proposeCall(name, P.stranger, { gameId: G.private, ...args });
        assert.deepEqual(hiddenW.result.data, { error: 'not_found' }, `${name}: hidden`);
        assert.deepEqual(hiddenW.result.data, missingW.result.data);
        assert.equal(hiddenW.result.summary, missingW.result.summary);
      }
      console.log('writes: hidden → not_found: ok');
    }

    // --- 10b: mark_my_share_paid, propose matrix = POST …/me/paid --------------------------
    {
      // stranger invited queued player gameAdmin owner leagueOwner globalAdmin
      // C = card, F = forbidden (403), S = refusal (no share / payer), HTTP answers in brackets.
      const expected: Record<AgentMatrixActor, ['C' | 'F' | 'S', number]> = {
        stranger: ['F', 403],
        invited: ['F', 403],
        queued: ['F', 403],
        player: ['C', 200],
        gameAdmin: ['C', 200],
        owner: ['S', 400],
        leagueOwner: ['F', 403],
        globalAdmin: ['S', 403],
      } as Record<AgentMatrixActor, ['C' | 'F' | 'S', number]>;
      for (const [actor, [kind, httpStatus]] of Object.entries(expected) as [AgentMatrixActor, ['C' | 'F' | 'S', number]][]) {
        const agentGame = await priced(`Mark matrix A ${actor}`);
        const httpGame = await priced(`Mark matrix H ${actor}`);
        const before = await ledger(agentGame);
        const out = await proposeCall('mark_my_share_paid', P[actor], { gameId: agentGame });
        if (kind === 'C') {
          assert.ok(out.plan, `${actor}: card (${JSON.stringify(out.result.data)})`);
          assert.deepEqual(await ledger(agentGame), before, `${actor}: nothing changes at propose`);
          const outcome = await confirm('mark_my_share_paid', P[actor], out.plan);
          assert.ok(!outcome.failed, `${actor}: ${outcome.message}`);
          assert.equal(outcome.message, EN['result.markedPaid']);
        } else if (kind === 'F') {
          assert.equal(err(out.result), 'forbidden', `${actor}: forbidden (${JSON.stringify(out.result.data)})`);
        } else {
          assert.ok(!out.plan && ['no_share', 'is_payer'].includes(err(out.result) as string), `${actor}: refusal ${JSON.stringify(out.result.data)}`);
        }
        const res = await post(P[actor].userId, `/games/${httpGame}/cost-shares/me/paid`, { method: 'MANUAL' });
        assert.equal(res.status, httpStatus, `${actor}: HTTP ${res.status} ${res.message}`);
        const agentRows = (await ledger(agentGame)).map((row) => JSON.parse(row) as { userId: string; markedPaidAt: string | null; method: string });
        const httpRows = (await ledger(httpGame)).map((row) => JSON.parse(row) as { userId: string; markedPaidAt: string | null; method: string });
        assert.deepEqual(
          agentRows.map((r) => [r.userId, r.markedPaidAt != null, r.method]),
          httpRows.map((r) => [r.userId, r.markedPaidAt != null, r.method]),
          `${actor}: agent ledger = HTTP ledger`,
        );
      }
      console.log('mark_my_share_paid matrix (propose + confirm = HTTP): ok');
    }

    // --- 10b: card, payer, already marked, stale, lost role --------------------------------
    {
      const gameId = await priced('Mark card');
      const { plan, preview } = await propose('mark_my_share_paid', P.player, { gameId });
      assert.equal(preview.title, t('preview.markPaid.title', { game: `Mark card ${s}` }));
      assert.equal(lineTo(preview, EN['field.amount'])?.to, '€13.33', 'server amount on the card');
      const ownerName = await nameIn(gameId, P.owner.userId);
      assert.equal(lineTo(preview, EN['field.to'])?.to, ownerName, 'owed to the payer (the owner)');
      assert.equal(lineTo(preview, EN['field.method'])?.to, EN['value.paidOutsideApp']);
      assert.deepEqual(warnings(preview), [t('warn.payerConfirms', { payer: ownerName })]);
      assert.deepEqual(plan, { gameId, amountMinor: 1333, currency: 'EUR', payerUserId: P.owner.userId, state: 'UNPAID' });
      const ru = await propose('mark_my_share_paid', P.player, { gameId }, 'ru');
      assert.ok(ru.preview.title.startsWith('Отметить вашу долю'), ru.preview.title);

      // The payer can't mark their own share (card never made); HTTP says the same.
      const payer = await proposeCall('mark_my_share_paid', P.owner, { gameId });
      assert.equal(err(payer.result), 'is_payer');
      assert.equal((payer.result.data as Json).message, EN['refuse.isPayer']);
      assert.ok(payer.result.entities?.some((e) => e.type === 'handoff' && e.url === `/games/${gameId}?section=cost`));
      assert.equal((await post(P.owner.userId, `/games/${gameId}/cost-shares/me/paid`, { method: 'MANUAL' })).message, 'errors.cost.payerCannotPaySelf');

      assert.ok(!(await confirm('mark_my_share_paid', P.player, plan)).failed);
      assert.equal((await shareState(gameId, P.player.userId))?.state, 'MARKED_PAID');
      const again = await proposeCall('mark_my_share_paid', P.player, { gameId });
      assert.equal(err(again.result), 'already_marked', 'already marked → no card');
      // The same card confirmed twice: the share is no longer UNPAID → stale, nothing written.
      const snapshot = await ledger(gameId);
      const twice = await confirm('mark_my_share_paid', P.player, plan);
      assert.deepEqual(twice.failed, { changed: false });
      assert.equal(twice.message, EN['result.stale']);
      assert.deepEqual(await ledger(gameId), snapshot);

      // Stale: the price changes (re-split) after the card.
      const g2 = await priced('Mark stale price');
      const card = await propose('mark_my_share_paid', P.player, { gameId: g2 });
      await prisma.game.update({ where: { id: g2 }, data: { priceTotal: 60 } });
      await http(P.owner.userId, `/games/${g2}/cost-shares`);
      const snap2 = await ledger(g2);
      const stale = await confirm('mark_my_share_paid', P.player, card.plan);
      assert.deepEqual(stale.failed, { changed: false }, 'price change → stale');
      assert.deepEqual(await ledger(g2), snap2, 'nothing written');
      assert.equal((await shareState(g2, P.player.userId))?.state, 'UNPAID');

      // Stale: the payer changes after the card.
      const g3 = await priced('Mark stale payer');
      const card3 = await propose('mark_my_share_paid', P.player, { gameId: g3 });
      await prisma.game.update({ where: { id: g3 }, data: { costPayerId: P.gameAdmin.userId } });
      const stale3 = await confirm('mark_my_share_paid', P.player, card3.plan);
      assert.deepEqual(stale3.failed, { changed: false }, 'payer change → stale');
      assert.equal((await shareState(g3, P.player.userId))?.state, 'UNPAID');

      // Stale: a player joins after the card (TOTAL price re-splits: 40 € / 4).
      const g4 = await priced('Mark stale join');
      const card4 = await propose('mark_my_share_paid', P.player, { gameId: g4 });
      await prisma.gameParticipant.updateMany({ where: { gameId: g4, userId: P.queued.userId }, data: { status: ParticipantStatus.PLAYING } });
      const stale4 = await confirm('mark_my_share_paid', P.player, card4.plan);
      assert.deepEqual(stale4.failed, { changed: false }, 're-split → stale');
      assert.equal((await shareState(g4, P.player.userId))?.state, 'UNPAID');

      // Lost role between propose and confirm → refused at authorize, nothing written.
      const g5 = await priced('Mark lost role');
      const card5 = await propose('mark_my_share_paid', P.player, { gameId: g5 });
      await prisma.gameParticipant.updateMany({ where: { gameId: g5, userId: P.player.userId }, data: { status: ParticipantStatus.IN_QUEUE } });
      const snap5 = await ledger(g5);
      assert.equal(await statusOf(() => confirm('mark_my_share_paid', P.player, card5.plan)), 403);
      assert.deepEqual(await ledger(g5), snap5, 'refused before any sync: nothing written');
      console.log('mark_my_share_paid card / payer / stale / lost role: ok');
    }

    // --- 10c: confirm_share_received, propose matrix = POST …/:userId/confirm ---------------
    {
      const expected: Record<AgentMatrixActor, ['C' | 'F', number]> = {
        stranger: ['F', 403],
        invited: ['F', 403],
        queued: ['F', 403],
        player: ['F', 403],
        gameAdmin: ['C', 200],
        owner: ['C', 200],
        leagueOwner: ['F', 403],
        globalAdmin: ['C', 200],
      } as Record<AgentMatrixActor, ['C' | 'F', number]>;
      for (const [actor, [kind, httpStatus]] of Object.entries(expected) as [AgentMatrixActor, ['C' | 'F', number]][]) {
        const agentGame = await priced(`Confirm matrix A ${actor}`);
        const httpGame = await priced(`Confirm matrix H ${actor}`);
        const target = actor === 'player' ? P.gameAdmin.userId : P.player.userId;
        const before = await ledger(agentGame);
        const out = await proposeCall('confirm_share_received', P[actor], { gameId: agentGame, playerId: target });
        if (kind === 'C') {
          assert.ok(out.plan && out.preview, `${actor}: card (${JSON.stringify(out.result.data)})`);
          assert.deepEqual(await ledger(agentGame), before, `${actor}: nothing changes at propose`);
          const adminOnly = warnings(out.preview).includes(EN['warn.platformAdmin']);
          assert.equal(adminOnly, actor === 'globalAdmin', `${actor}: platform admin warning`);
          const outcome = await confirm('confirm_share_received', P[actor], out.plan);
          assert.ok(!outcome.failed, `${actor}: ${outcome.message}`);
        } else {
          assert.equal(err(out.result), 'forbidden', `${actor}: forbidden (${JSON.stringify(out.result.data)})`);
        }
        const res = await post(P[actor].userId, `/games/${httpGame}/cost-shares/${target}/confirm`, { confirmed: true });
        assert.equal(res.status, httpStatus, `${actor}: HTTP ${res.status} ${res.message}`);
        assert.deepEqual(await shareState(agentGame, target), await shareState(httpGame, target), `${actor}: agent row = HTTP row`);
      }
      console.log('confirm_share_received matrix (propose + confirm = HTTP): ok');
    }

    // --- 10c: card, undo, refusals, stale, lost role ---------------------------------------
    {
      const gameId = await priced('Confirm card');
      const twin = await priced('Confirm card twin');
      // UNPAID → Settled: the card says the player hasn't marked it themselves.
      const playerName = await nameIn(gameId, P.player.userId);
      const card = await propose('confirm_share_received', P.owner, { gameId, playerId: P.player.userId });
      assert.equal(card.preview.title, t('preview.received.title', { player: playerName }));
      assert.equal(lineTo(card.preview, EN['field.player'])?.to, playerName);
      const stateLine = lineTo(card.preview, EN['field.state']);
      assert.deepEqual([stateLine?.from, stateLine?.to], [EN['state.UNPAID'], EN['state.SETTLED']]);
      assert.equal(lineTo(card.preview, EN['field.amount'])?.to, '€13.33');
      assert.equal(lineTo(card.preview, EN['field.game'])?.to, `Confirm card ${s}`);
      assert.ok(warnings(card.preview).includes(t('warn.notMarkedByPlayer', { player: playerName })), JSON.stringify(card.preview.warnings));
      assert.ok(!warnings(card.preview).includes(EN['warn.frozen']));
      const done = await confirm('confirm_share_received', P.owner, card.plan);
      assert.ok(!done.failed, done.message);
      assert.equal(done.message, t('result.received', { player: playerName }));
      assert.equal((await post(P.owner.userId, `/games/${twin}/cost-shares/${P.player.userId}/confirm`, { confirmed: true })).status, 200);
      assert.deepEqual(await shareState(gameId, P.player.userId), await shareState(twin, P.player.userId));
      assert.equal((await shareState(gameId, P.player.userId))?.state, 'SETTLED');

      // Already received → no card.
      assert.equal(err((await proposeCall('confirm_share_received', P.owner, { gameId, playerId: P.player.userId })).result), 'already_received');

      // Undo: Settled → Marked paid (confirming stamped markedPaidAt), same as HTTP confirmed:false.
      const undo = await propose('confirm_share_received', P.owner, { gameId, playerId: P.player.userId, received: false });
      const undoLine = lineTo(undo.preview, EN['field.state']);
      assert.deepEqual([undoLine?.from, undoLine?.to], [EN['state.SETTLED'], EN['state.MARKED_PAID']]);
      assert.equal(undo.preview.title, t('preview.notReceived.title', { player: playerName }));
      assert.ok(warnings(undo.preview).includes(t('warn.undo', { player: playerName })));
      assert.ok(!(await confirm('confirm_share_received', P.owner, undo.plan)).failed);
      assert.equal((await post(P.owner.userId, `/games/${twin}/cost-shares/${P.player.userId}/confirm`, { confirmed: false })).status, 200);
      assert.deepEqual(await shareState(gameId, P.player.userId), await shareState(twin, P.player.userId));
      assert.equal((await shareState(gameId, P.player.userId))?.state, 'MARKED_PAID');
      assert.equal(err((await proposeCall('confirm_share_received', P.owner, { gameId, playerId: P.player.userId, received: false })).result), 'not_received');

      // Refusals: the payer's own row, someone with no share, a coin-paid share.
      assert.equal(err((await proposeCall('confirm_share_received', P.owner, { gameId, playerId: P.owner.userId })).result), 'payer_row');
      assert.equal(err((await proposeCall('confirm_share_received', P.owner, { gameId, playerId: P.queued.userId })).result), 'no_share');
      assert.equal((await post(P.owner.userId, `/games/${twin}/cost-shares/${P.queued.userId}/confirm`, { confirmed: true })).status, 403, 'HTTP refuses a non-share too');
      await prisma.gameCostShare.update({
        where: { gameId_userId: { gameId, userId: P.gameAdmin.userId } },
        data: { method: 'COINS', markedPaidAt: new Date(), confirmedAt: new Date() },
      });
      for (const received of [true, false]) {
        const coin = await proposeCall('confirm_share_received', P.owner, { gameId, playerId: P.gameAdmin.userId, received });
        assert.equal(err(coin.result), 'paid_in_coins', `coin row (received=${received})`);
      }
      assert.equal((await post(P.owner.userId, `/games/${gameId}/cost-shares/${P.gameAdmin.userId}/confirm`, { confirmed: false })).status, 400, 'HTTP refuses the coin row');

      // Stale: the player marks paid after the card (state moved).
      const g2 = await priced('Confirm stale state');
      const c2 = await propose('confirm_share_received', P.owner, { gameId: g2, playerId: P.player.userId });
      assert.equal((await post(P.player.userId, `/games/${g2}/cost-shares/me/paid`, { method: 'MANUAL' })).status, 200);
      const snap2 = await ledger(g2);
      const s2 = await confirm('confirm_share_received', P.owner, c2.plan);
      assert.deepEqual(s2.failed, { changed: false }, 'state change → stale');
      assert.deepEqual(await ledger(g2), snap2);

      // Stale: the price changes after the card.
      const g3 = await priced('Confirm stale price');
      const c3 = await propose('confirm_share_received', P.owner, { gameId: g3, playerId: P.player.userId });
      await prisma.game.update({ where: { id: g3 }, data: { priceTotal: 90 } });
      const s3 = await confirm('confirm_share_received', P.owner, c3.plan);
      assert.deepEqual(s3.failed, { changed: false }, 'price change → stale');
      assert.equal((await shareState(g3, P.player.userId))?.state, 'UNPAID');

      // Stale: the payer changes after the card (the organizer may still confirm, but the card is old).
      const g4 = await priced('Confirm stale payer');
      const c4 = await propose('confirm_share_received', P.owner, { gameId: g4, playerId: P.player.userId });
      await prisma.game.update({ where: { id: g4 }, data: { costPayerId: P.gameAdmin.userId } });
      const s4 = await confirm('confirm_share_received', P.owner, c4.plan);
      assert.deepEqual(s4.failed, { changed: false }, 'payer change → stale');
      assert.equal((await shareState(g4, P.player.userId))?.state, 'UNPAID');

      // Lost role: the game admin is demoted between propose and confirm.
      const g5 = await priced('Confirm lost role');
      const c5 = await propose('confirm_share_received', P.gameAdmin, { gameId: g5, playerId: P.player.userId });
      await prisma.gameParticipant.updateMany({ where: { gameId: g5, userId: P.gameAdmin.userId }, data: { role: ParticipantRole.PARTICIPANT } });
      assert.equal(await statusOf(() => confirm('confirm_share_received', P.gameAdmin, c5.plan)), 403);
      assert.equal((await shareState(g5, P.player.userId))?.state, 'UNPAID');
      console.log('confirm_share_received card / undo / refusals / stale / lost role: ok');
    }

    // --- 10c: a payer who only plays; trainer; league season owner --------------------------
    {
      // A plain player who is the payer can confirm (and still can't mark their own share).
      const payerGame = await priced('Confirm payer player', { costPayerId: P.player.userId });
      const pc = await propose('confirm_share_received', P.player, { gameId: payerGame, playerId: P.gameAdmin.userId });
      assert.ok(!warnings(pc.preview).includes(EN['warn.platformAdmin']));
      assert.ok(!(await confirm('confirm_share_received', P.player, pc.plan)).failed);
      assert.equal((await shareState(payerGame, P.gameAdmin.userId))?.state, 'SETTLED');
      assert.equal(err((await proposeCall('mark_my_share_paid', P.player, { gameId: payerGame })).result), 'is_payer');

      // Trainer (TRAINING, NON_PLAYING + ADMIN): no share to mark, may confirm.
      const TRAINING_ROSTER: Roster = [
        ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING],
        ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
        ['invited', ParticipantRole.ADMIN, ParticipantStatus.NON_PLAYING],
      ];
      const training = await mkGame('Confirm training', { ...PRICE_40, entityType: EntityType.TRAINING, trainerId: P.invited.userId }, TRAINING_ROSTER);
      const trainingTwin = await mkGame('Confirm training twin', { ...PRICE_40, entityType: EntityType.TRAINING, trainerId: P.invited.userId }, TRAINING_ROSTER);
      assert.equal(err((await proposeCall('mark_my_share_paid', P.invited, { gameId: training })).result), 'no_share', 'trainer has no share');
      assert.equal((await post(P.invited.userId, `/games/${trainingTwin}/cost-shares/me/paid`, { method: 'MANUAL' })).status, 403);
      const tc = await propose('confirm_share_received', P.invited, { gameId: training, playerId: P.player.userId });
      assert.ok(!(await confirm('confirm_share_received', P.invited, tc.plan)).failed);
      assert.equal((await post(P.invited.userId, `/games/${trainingTwin}/cost-shares/${P.player.userId}/confirm`, { confirmed: true })).status, 200);
      assert.deepEqual(await shareState(training, P.player.userId), await shareState(trainingTwin, P.player.userId));
      assert.equal((await shareState(training, P.player.userId))?.state, 'SETTLED');

      // League: the season owner (not on the fixture) confirms a fixture share; the player marks theirs.
      const season = await mkGame(
        'Confirm season',
        { entityType: EntityType.LEAGUE_SEASON, isPublic: false, priceType: 'PER_PERSON', priceTotal: 10, priceCurrency: 'EUR' },
        [['leagueOwner', ParticipantRole.OWNER, ParticipantStatus.NON_PLAYING]],
      );
      const FIXTURE_ROSTER: Roster = [
        ['owner', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
        ['gameAdmin', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
        ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
      ];
      const fixtureGame = await mkGame('Confirm fixture', { entityType: EntityType.LEAGUE, parentId: season, priceType: 'NOT_KNOWN' }, FIXTURE_ROSTER);
      const mk = await propose('mark_my_share_paid', P.player, { gameId: fixtureGame });
      assert.equal(lineTo(mk.preview, EN['field.amount'])?.to, '€10.00', 'season price');
      assert.equal((mk.plan as { payerUserId: string }).payerUserId, P.leagueOwner.userId, 'the season owner is owed');
      assert.ok(!(await confirm('mark_my_share_paid', P.player, mk.plan)).failed);
      const lc = await propose('confirm_share_received', P.leagueOwner, { gameId: fixtureGame, playerId: P.player.userId });
      assert.ok(!warnings(lc.preview).includes(EN['warn.platformAdmin']), 'season owner is an organizer');
      assert.ok(!warnings(lc.preview).some((w) => w.includes("hasn't marked")), 'the player marked it');
      assert.deepEqual([lineTo(lc.preview, EN['field.state'])?.from, lineTo(lc.preview, EN['field.state'])?.to], [EN['state.MARKED_PAID'], EN['state.SETTLED']]);
      assert.ok(!(await confirm('confirm_share_received', P.leagueOwner, lc.plan)).failed);
      assert.equal((await shareState(fixtureGame, P.player.userId))?.state, 'SETTLED');
      assert.equal(err((await proposeCall('confirm_share_received', P.leagueOwner, { gameId: season, playerId: P.player.userId })).result), 'not_found', 'no ledger on a season');
      console.log('payer player / trainer / league season owner: ok');
    }

    // --- frozen ledger: marking and confirming still work -----------------------------------
    {
      const frozen = await priced('Money frozen');
      await prisma.game.update({ where: { id: frozen }, data: { costFrozenAt: new Date(), resultsStatus: ResultsStatus.FINAL, status: 'FINISHED' } });
      const mk = await propose('mark_my_share_paid', P.player, { gameId: frozen });
      assert.ok(!(await confirm('mark_my_share_paid', P.player, mk.plan)).failed);
      const cf = await propose('confirm_share_received', P.owner, { gameId: frozen, playerId: P.player.userId });
      assert.ok(warnings(cf.preview).includes(EN['warn.frozen']));
      assert.ok(!(await confirm('confirm_share_received', P.owner, cf.plan)).failed);
      assert.equal((await shareState(frozen, P.player.userId))?.state, 'SETTLED');
      console.log('frozen: ok');
    }

    // --- one card at a time; taint never auto-approves; ALWAYS_ALLOW otherwise does --------
    {
      const gameId = await priced('Money auto');
      await prisma.agentToolPermission.create({ data: { userId: P.owner.userId, toolName: 'confirm_share_received', mode: AgentToolPermissionMode.ALWAYS_ALLOW } });
      try {
        const ctx1 = await writeCtx(P.owner);
        const first = await registry.executeTool(ctx1, 'confirm_share_received', { gameId, playerId: P.player.userId });
        assert.ok(first.awaitingConfirmation, JSON.stringify(first.data));
        const second = await registry.executeTool(await writeCtx(P.owner), 'confirm_share_received', { gameId, playerId: P.gameAdmin.userId });
        assert.equal(second.ok, false, 'a second card while one is pending is refused');
        assert.equal(err(second), 'conflict');
        // A run tainted by untrusted content (game chat) never auto-approves, ALWAYS_ALLOW or not.
        assert.equal(await autoApproveAgentAction(registry, first.awaitingConfirmation.actionId, new Date(), { runTainted: true }), null);
        const pending = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: first.awaitingConfirmation.actionId } });
        assert.equal(pending.status, AgentActionStatus.PENDING);
        assert.equal((await shareState(gameId, P.player.userId))?.state, 'UNPAID', 'tainted: nothing written');
        // Untainted + ALWAYS_ALLOW (standard tier): executes through the normal confirm path.
        const auto = await autoApproveAgentAction(registry, first.awaitingConfirmation.actionId, new Date());
        assert.ok(auto, 'standard + always allow auto-approves');
        assert.equal(auto.action.status, AgentActionStatus.EXECUTED);
        assert.equal((await shareState(gameId, P.player.userId))?.state, 'SETTLED');
      } finally {
        await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: 'confirm_share_received' } });
        await expirePending();
      }
      console.log('one card at a time / taint / always allow: ok');
    }

    // =========================================================================================
    // Slices 10d / 10e / 10f: pay_my_share_with_coins, set_game_price, remind_unpaid_shares
    // =========================================================================================
    const put = async (userId: string, path: string, body: unknown) => {
      const res = await fetch(`http://127.0.0.1:${port}/api${path}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${generateShortAccessToken({ userId })}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      return { status: res.status, message: json?.message };
    };
    const wallet = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { wallet: true } })).wallet;
    const setWallet = (userId: string, coins: number) => prisma.user.update({ where: { id: userId }, data: { wallet: coins } });
    const coinRow = async (gameId: string, userId: string) =>
      prisma.gameCostShare.findUnique({
        where: { gameId_userId: { gameId, userId } },
        select: { amountCents: true, markedPaidAt: true, confirmedAt: true, method: true, transactionId: true },
      });
    const permissions = new AgentToolPermissionService(() => registry);
    const priceRow = (gameId: string) =>
      prisma.game.findUniqueOrThrow({ where: { id: gameId }, select: { priceType: true, priceTotal: true, priceCurrency: true } });

    // --- registry (10d-10f) -----------------------------------------------------------------
    for (const [name, tier] of [['pay_my_share_with_coins', 'critical'], ['set_game_price', 'standard'], ['remind_unpaid_shares', 'standard']] as const) {
      const tool = registry.get(name);
      assert.ok(tool && AGENT_TOOL_DEFINITIONS.includes(tool), `${name} registered`);
      assert.equal(tool.kind, 'write');
      assert.equal(tool.riskTier, tier, `${name}: ${tier}`);
      assert.equal(tool.scope, 'user');
      assert.ok(tool.promptHint, `${name}: promptHint`);
      assert.equal(AGENT_TOOL_AUTHZ_COVERAGE[name], 'money-write-cases');
      for (const bad of [{ gameId: 'g', userId: 'x' }, { gameId: 'g', extra: 1 }]) {
        assert.equal(tool.input.safeParse(bad).success, false, `${name} rejects ${JSON.stringify(bad)}`);
      }
    }
    {
      const input = registry.get('set_game_price')!.input;
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'TOTAL', amount: 40, currency: 'EUR' }).success, true);
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'FREE' }).success, true);
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'GRATIS' }).success, false, 'unknown price type');
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'TOTAL', amount: 40, currency: 'XYZ' }).success, false, 'unknown currency');
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'TOTAL', amount: -5 }).success, false, 'negative amount');
      assert.equal(input.safeParse({ gameId: 'g', priceType: 'TOTAL', amount: 40, priceTotal: 40 }).success, false, 'strict');
    }
    // Coins are critical: never ALWAYS_ALLOW (400); the standard ones may be.
    await assert.rejects(permissions.set(P.player, 'pay_my_share_with_coins', 'ALWAYS_ALLOW'), (e: { statusCode?: number }) => e.statusCode === 400);
    for (const name of ['set_game_price', 'remind_unpaid_shares']) {
      await permissions.set(P.owner, name, 'ALWAYS_ALLOW');
      await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: name } });
    }
    for (const [name, args] of [
      ['pay_my_share_with_coins', {}],
      ['set_game_price', { priceType: 'FREE' }],
      ['remind_unpaid_shares', {}],
    ] as const) {
      const missingW = await proposeCall(name, P.stranger, { gameId: `missing-${s}`, ...args });
      const hiddenW = await proposeCall(name, P.stranger, { gameId: G.private, ...args });
      assert.deepEqual(hiddenW.result.data, { error: 'not_found' }, `${name}: hidden`);
      assert.deepEqual(hiddenW.result.data, missingW.result.data);
      assert.equal(hiddenW.result.summary, missingW.result.summary);
    }
    console.log('registry / hidden (10d-10f): ok');

    // --- 10d: pay_my_share_with_coins ------------------------------------------------------
    // Ledgers, wallets and fixtures first; the coin rate is set only for the shortest window
    // (the dev DB is shared) and always restored in `finally`.
    let coinPaidGame = '';
    {
      const COIN_ACTORS = ['stranger', 'queued', 'player', 'gameAdmin', 'owner', 'globalAdmin'] as const;
      const matrixGames = new Map<string, { agent: string; http: string }>();
      for (const actor of COIN_ACTORS) {
        matrixGames.set(actor, { agent: await priced(`Coins matrix A ${actor}`), http: await priced(`Coins matrix H ${actor}`) });
      }
      const happy = await priced('Coins happy');
      const doubleTap = await priced('Coins double');
      const short = await priced('Coins short');
      const spent = await priced('Coins spent');
      const repriced = await priced('Coins repriced');
      const rerated = await priced('Coins rerated');
      const expectGame = await priced('Coins expect');
      const marked = await priced('Coins marked');
      const forged = await priced('Coins forged');
      const disabled = await priced('Coins disabled');
      const training = await mkGame(
        'Coins training',
        { ...PRICE_40, entityType: EntityType.TRAINING, trainerId: P.invited.userId },
        [
          ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING],
          ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
          ['invited', ParticipantRole.ADMIN, ParticipantStatus.NON_PLAYING],
        ],
      );
      assert.equal((await post(P.player.userId, `/games/${marked}/cost-shares/me/paid`, { method: 'MANUAL' })).status, 200);
      const ownerName = await nameIn(happy, P.owner.userId);
      await setWallet(P.player.userId, 100_000);
      await setWallet(P.gameAdmin.userId, 100_000);

      const previousRate = await getSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT);
      try {
        await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '100');

        // Propose + confirm = POST …/me/paid {method:'COINS'}, per actor.
        // C = card (critical), F = forbidden, S = refusal without a card; HTTP status in brackets.
        const expected: Record<(typeof COIN_ACTORS)[number], ['C' | 'F' | 'S', number]> = {
          stranger: ['F', 403],
          queued: ['F', 403],
          player: ['C', 200],
          gameAdmin: ['C', 200],
          owner: ['S', 400],
          globalAdmin: ['S', 403],
        };
        for (const actor of COIN_ACTORS) {
          const [kind, httpStatus] = expected[actor];
          const { agent, http: httpGame } = matrixGames.get(actor)!;
          const out = await proposeCall('pay_my_share_with_coins', P[actor], { gameId: agent });
          const before = await wallet(P[actor].userId);
          if (kind === 'C') {
            assert.ok(out.plan, `${actor}: card (${JSON.stringify(out.result.data)})`);
            assert.equal(out.tier, 'critical', `${actor}: critical tier`);
            const outcome = await confirm('pay_my_share_with_coins', P[actor], out.plan);
            assert.ok(!outcome.failed, `${actor}: ${outcome.message}`);
          } else if (kind === 'F') {
            assert.equal(err(out.result), 'forbidden', `${actor}: forbidden (${JSON.stringify(out.result.data)})`);
          } else {
            assert.ok(!out.plan && ['no_share', 'is_payer'].includes(err(out.result) as string), `${actor}: refusal ${JSON.stringify(out.result.data)}`);
          }
          const agentSpent = before - (await wallet(P[actor].userId));
          const beforeHttp = await wallet(P[actor].userId);
          const res = await post(P[actor].userId, `/games/${httpGame}/cost-shares/me/paid`, { method: 'COINS' });
          assert.equal(res.status, httpStatus, `${actor}: HTTP ${res.status} ${res.message}`);
          assert.equal(agentSpent, beforeHttp - (await wallet(P[actor].userId)), `${actor}: same coins moved`);
          const shape = async (gameId: string) => {
            const row = await coinRow(gameId, P[actor].userId);
            return row ? { settled: row.confirmedAt != null, method: row.method, tx: row.transactionId != null } : null;
          };
          assert.deepEqual(await shape(agent), await shape(httpGame), `${actor}: agent row = HTTP row`);
        }
        console.log('pay_my_share_with_coins matrix (propose + confirm = HTTP): ok');

        // The card: server share, coins, payer, balance before → after, rate.
        {
          await setWallet(P.player.userId, 2000);
          const ownerBefore = await wallet(P.owner.userId);
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: happy });
          assert.equal(card.preview.title, t('preview.payCoins.title', { game: `Coins happy ${s}` }));
          assert.equal(lineTo(card.preview, EN['field.share'])?.to, '€13.33');
          assert.equal(lineTo(card.preview, EN['field.coins'])?.to, '1333');
          assert.equal(lineTo(card.preview, EN['field.to'])?.to, ownerName);
          const balanceLine = lineTo(card.preview, EN['field.balance']);
          assert.deepEqual([balanceLine?.from, balanceLine?.to], ['2000', '667']);
          assert.deepEqual(warnings(card.preview), [
            t('warn.coinsMoveNow', { payer: ownerName }),
            t('warn.coinRate', { rate: '100', currency: 'EUR' }),
          ]);
          assert.deepEqual(card.plan, { gameId: happy, amountMinor: 1333, currency: 'EUR', coins: 1333, coinsPerCurrencyUnit: 100, payerUserId: P.owner.userId });
          const done = await confirm('pay_my_share_with_coins', P.player, card.plan);
          assert.ok(!done.failed, done.message);
          assert.equal(done.message, t('result.paidWithCoins', { coins: '1333', payer: ownerName }));
          assert.equal(await wallet(P.player.userId), 667, 'the balance on the card');
          assert.equal(await wallet(P.owner.userId), ownerBefore + 1333, 'the payer got the coins');
          const row = await coinRow(happy, P.player.userId);
          assert.ok(row?.confirmedAt && row.method === 'COINS' && row.transactionId, 'settled in coins, transaction stamped');
          assert.equal(err((await proposeCall('pay_my_share_with_coins', P.player, { gameId: happy })).result), 'already_settled');
          coinPaidGame = happy;
        }

        // Double confirm of one card → one transfer; the second is stale.
        {
          await setWallet(P.player.userId, 5000);
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: doubleTap });
          assert.ok(!(await confirm('pay_my_share_with_coins', P.player, card.plan)).failed);
          const second = await confirm('pay_my_share_with_coins', P.player, card.plan);
          assert.deepEqual(second.failed, { changed: false });
          assert.equal(await wallet(P.player.userId), 5000 - 1333, 'exactly one transfer');
          assert.equal(await prisma.transaction.count({ where: { fromUserId: P.player.userId, toUserId: P.owner.userId, transactionRows: { some: { name: `Game share · Coins double ${s}` } } } }), 1);
        }

        // Not enough coins at propose → no card, balance and cost stated.
        {
          await setWallet(P.player.userId, 100);
          const out = await proposeCall('pay_my_share_with_coins', P.player, { gameId: short });
          assert.equal(err(out.result), 'insufficient_coins');
          assert.equal((out.result.data as Json).message, t('refuse.insufficientCoins', { balance: '100', coins: '1333' }));
          assert.equal((out.result.data as Json).coinBalance, 100);
          assert.equal((await post(P.player.userId, `/games/${short}/cost-shares/me/paid`, { method: 'COINS' })).message, 'errors.cost.insufficientCoins');
        }

        // Balance spent between propose and confirm → FAILED, claim handed back, nothing moved.
        {
          await setWallet(P.player.userId, 2000);
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: spent });
          await setWallet(P.player.userId, 10);
          const outcome = await confirm('pay_my_share_with_coins', P.player, card.plan);
          assert.deepEqual(outcome.failed, { changed: false });
          assert.equal(outcome.message, EN['error.insufficientCoins']);
          assert.equal(await wallet(P.player.userId), 10);
          const row = await coinRow(spent, P.player.userId);
          assert.ok(row && row.confirmedAt == null && row.transactionId == null && row.method === 'MANUAL', 'share still unpaid');
        }

        // Stale: the price changes (re-split) after the card.
        {
          await setWallet(P.player.userId, 5000);
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: repriced });
          await prisma.game.update({ where: { id: repriced }, data: { priceTotal: 60 } });
          const outcome = await confirm('pay_my_share_with_coins', P.player, card.plan);
          assert.deepEqual(outcome.failed, { changed: false }, 're-split → stale');
          assert.equal(outcome.message, EN['result.stale']);
          assert.equal(await wallet(P.player.userId), 5000, 'no coins moved');
          assert.equal((await coinRow(repriced, P.player.userId))?.confirmedAt, null);
        }

        // Stale: the coin rate changes after the card (same share, other coins).
        {
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: rerated });
          await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '200');
          try {
            const outcome = await confirm('pay_my_share_with_coins', P.player, card.plan);
            assert.deepEqual(outcome.failed, { changed: false }, 'rate change → stale');
            assert.equal(await wallet(P.player.userId), 5000);
          } finally {
            await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, '100');
          }
        }

        // The service's `expect` guard (the race the tool's own re-read can't close): any
        // mismatch → 409 shareChanged, no transfer, the row untouched.
        {
          const summary = await getGameCostSummary(expectGame, P.player.userId);
          const good = { amountMinor: summary.viewerShare!.amountMinor, coins: summary.viewerCoinCost!, payerUserId: P.owner.userId };
          for (const bad of [
            { ...good, amountMinor: good.amountMinor + 1 },
            { ...good, coins: good.coins - 1 },
            { ...good, payerUserId: P.gameAdmin.userId },
          ]) {
            const snapshot = await ledger(expectGame);
            await assert.rejects(
              markOwnShareAsPaid(expectGame, P.player.userId, 'COINS', { expect: bad }),
              (e: unknown) => e instanceof ApiError && e.statusCode === 409 && e.message === 'errors.cost.shareChanged',
              JSON.stringify(bad),
            );
            assert.deepEqual(await ledger(expectGame), snapshot, 'nothing written');
            assert.equal(await wallet(P.player.userId), 5000, 'no coins moved');
          }
          await markOwnShareAsPaid(expectGame, P.player.userId, 'COINS', { expect: good });
          assert.equal(await wallet(P.player.userId), 5000 - good.coins, 'a matching expect pays');
        }

        // A share marked paid outside the app can still be paid in coins (as the service allows), with a warning.
        {
          const card = await propose('pay_my_share_with_coins', P.player, { gameId: marked });
          assert.ok(warnings(card.preview).includes(t('warn.alreadyMarkedCoins', { payer: ownerName })));
        }

        // Critical: a forged ALWAYS_ALLOW row never auto-approves; the card stays pending.
        {
          await prisma.agentToolPermission.create({ data: { userId: P.player.userId, toolName: 'pay_my_share_with_coins', mode: AgentToolPermissionMode.ALWAYS_ALLOW } });
          try {
            const executed = await registry.executeTool(await writeCtx(P.player), 'pay_my_share_with_coins', { gameId: forged });
            assert.ok(executed.awaitingConfirmation, JSON.stringify(executed.data));
            const action = await prisma.agentPendingAction.findUniqueOrThrow({ where: { id: executed.awaitingConfirmation.actionId } });
            assert.equal((action.args as { riskTier?: string }).riskTier, 'critical');
            assert.equal(await autoApproveAgentAction(registry, action.id, new Date()), null, 'critical is never auto-approved');
            assert.equal((await coinRow(forged, P.player.userId))?.confirmedAt, null, 'nothing paid');
          } finally {
            await prisma.agentToolPermission.deleteMany({ where: { userId: P.player.userId, toolName: 'pay_my_share_with_coins' } });
            await expirePending();
          }
        }

        // Trainer (NON_PLAYING + ADMIN): no share to pay.
        assert.equal(err((await proposeCall('pay_my_share_with_coins', P.invited, { gameId: training })).result), 'no_share');

        // Coins disabled (no rate): refused with the service's own reason, as over HTTP.
        await prisma.platformSetting.deleteMany({ where: { key: PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT } });
        invalidateSettingsCache();
        assert.equal(err((await proposeCall('pay_my_share_with_coins', P.player, { gameId: disabled })).result), 'coins_unavailable');
        assert.equal((await post(P.player.userId, `/games/${disabled}/cost-shares/me/paid`, { method: 'COINS' })).message, 'errors.cost.coinsUnavailable');
      } finally {
        if (previousRate === null) {
          await prisma.platformSetting.deleteMany({ where: { key: PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT } });
          invalidateSettingsCache();
        } else {
          await setSetting(PLATFORM_SETTING_KEYS.COINS_PER_CURRENCY_UNIT, previousRate);
        }
      }
      console.log('pay_my_share_with_coins card / double tap / balance / stale / expect / critical / disabled: ok');
    }

    // --- 10e: set_game_price ---------------------------------------------------------------
    {
      // Propose + confirm = PUT /games/:id with the price fields, per actor.
      const expected: Record<AgentMatrixActor, ['C' | 'F', number]> = {
        stranger: ['F', 403],
        invited: ['F', 403],
        queued: ['F', 403],
        player: ['F', 403],
        gameAdmin: ['C', 200],
        owner: ['C', 200],
        leagueOwner: ['F', 403],
        globalAdmin: ['C', 200],
      };
      const body = { priceType: 'TOTAL', priceTotal: 60, priceCurrency: 'EUR' };
      for (const [actor, [kind, httpStatus]] of Object.entries(expected) as [AgentMatrixActor, ['C' | 'F', number]][]) {
        const agentGame = await priced(`Price matrix A ${actor}`);
        const httpGame = await priced(`Price matrix H ${actor}`);
        const out = await proposeCall('set_game_price', P[actor], { gameId: agentGame, priceType: 'TOTAL', amount: 60 });
        if (kind === 'C') {
          assert.ok(out.plan, `${actor}: card (${JSON.stringify(out.result.data)})`);
          assert.equal(out.tier, 'standard', `${actor}: unpaid split → standard`);
          assert.equal((await priceRow(agentGame)).priceTotal, 40, `${actor}: nothing changes at propose`);
          const outcome = await confirm('set_game_price', P[actor], out.plan);
          assert.ok(!outcome.failed, `${actor}: ${outcome.message}`);
        } else {
          assert.equal(err(out.result), 'forbidden', `${actor}: forbidden (${JSON.stringify(out.result.data)})`);
        }
        const res = await put(P[actor].userId, `/games/${httpGame}`, body);
        assert.equal(res.status, httpStatus, `${actor}: HTTP ${res.status} ${res.message}`);
        assert.deepEqual(await priceRow(agentGame), await priceRow(httpGame), `${actor}: agent price = HTTP price`);
        await getGameCostSummary(agentGame, P.owner.userId);
        await getGameCostSummary(httpGame, P.owner.userId);
        const amounts = async (g: string) => (await prisma.gameCostShare.findMany({ where: { gameId: g }, orderBy: { userId: 'asc' }, select: { userId: true, amountCents: true } }));
        assert.deepEqual(await amounts(agentGame), await amounts(httpGame), `${actor}: same split after the change`);
      }
      console.log('set_game_price matrix (propose + confirm = PUT /games/:id): ok');
    }
    {
      // The card: old → new price, "about X each"; the result shows the new split.
      const gameId = await priced('Price card');
      const card = await propose('set_game_price', P.owner, { gameId, priceType: 'PER_PERSON', amount: 12.5 });
      assert.equal(card.preview.title, t('preview.setPrice.title', { game: `Price card ${s}` }));
      const priceLine = lineTo(card.preview, EN['field.price']);
      assert.deepEqual([priceLine?.from, priceLine?.to], [t('value.priceTotal', { amount: '€40.00' }), t('value.pricePerPerson', { amount: '€12.50' })]);
      assert.equal(lineTo(card.preview, EN['field.split'])?.to, t('value.splitEach', { count: '3', amount: '€12.50' }));
      assert.deepEqual(warnings(card.preview), []);
      assert.deepEqual(card.plan, {
        gameId,
        from: { priceType: 'TOTAL', priceTotal: 40, priceCurrency: 'EUR' },
        to: { priceType: 'PER_PERSON', priceTotal: 12.5, priceCurrency: 'EUR' },
        paidShares: 0,
        coinShares: 0,
      });
      const done = await confirm('set_game_price', P.owner, card.plan);
      assert.ok(!done.failed, done.message);
      assert.equal(done.message, t('result.priceSet', { price: t('value.pricePerPerson', { amount: '€12.50' }) }));
      assert.equal((done.modelData?.cost as { total?: { amountMinor: number } }).total?.amountMinor, 3750, 'the new split, 3 × 12.50');
      assert.equal((await shareRow(gameId, P.player.userId))?.amountCents, 1250);

      // Input the service would refuse, refused before a card.
      for (const [args, label] of [
        [{ priceType: 'TOTAL' }, 'amount required'],
        [{ priceType: 'FREE', amount: 10 }, 'amount not allowed'],
        [{ priceType: 'PER_PERSON', amount: 12.5 }, 'same price'],
        [{ priceType: 'TOTAL', amount: 10.555 }, 'too many decimals'],
        [{ priceType: 'TOTAL', amount: 1000, currency: 'JPY' }, 'currency change fine'],
      ] as const) {
        const out = await proposeCall('set_game_price', P.owner, { gameId, ...args });
        if (label === 'currency change fine') {
          assert.ok(out.plan, label);
          assert.equal(out.tier, 'critical', 'currency change → critical');
          assert.ok(warnings(out.preview!).includes(t('warn.currencyChange', { from: 'EUR', to: 'JPY' })));
        } else {
          assert.equal(err(out.result), 'bad_request', `${label}: ${JSON.stringify(out.result.data)}`);
        }
      }
      const noCurrency = await mkGame('Price no currency', { priceType: 'NOT_KNOWN' });
      assert.equal(err((await proposeCall('set_game_price', P.owner, { gameId: noCurrency, priceType: 'TOTAL', amount: 30 })).result), 'bad_request', 'no currency yet: ask');
      const first = await propose('set_game_price', P.owner, { gameId: noCurrency, priceType: 'TOTAL', amount: 30, currency: 'EUR' });
      assert.equal(lineTo(first.preview, EN['field.price'])?.from, EN['value.priceNotSet']);
      assert.ok(!(await confirm('set_game_price', P.owner, first.plan)).failed);
      assert.deepEqual(await priceRow(noCurrency), { priceType: 'TOTAL', priceTotal: 30, priceCurrency: 'EUR' });

      // PER_TEAM: a price that shows no split (and drops the existing one) → critical.
      const perTeam = await priced('Price per team');
      const team = await proposeCall('set_game_price', P.owner, { gameId: perTeam, priceType: 'PER_TEAM', amount: 20 });
      assert.equal(team.tier, 'critical');
      assert.ok(warnings(team.preview!).includes(EN['warn.perTeamNoSplit']));
      assert.ok(warnings(team.preview!).includes(EN['warn.splitRemoved']));
      assert.equal(lineTo(team.preview!, EN['field.split']), undefined, 'no split line');
      console.log('set_game_price card / validation / per team: ok');
    }
    {
      // Escalation: a share marked paid → critical, warned; the change still applies like HTTP.
      const paid = await priced('Price paid');
      const paidTwin = await priced('Price paid twin');
      for (const g of [paid, paidTwin]) assert.equal((await post(P.player.userId, `/games/${g}/cost-shares/me/paid`, { method: 'MANUAL' })).status, 200);
      const card = await proposeCall('set_game_price', P.owner, { gameId: paid, priceType: 'TOTAL', amount: 30 });
      assert.equal(card.tier, 'critical', 'a paid share escalates');
      assert.ok(warnings(card.preview!).includes(t('warn.paidSharesChange', { count: '1' })));
      assert.ok(!(await confirm('set_game_price', P.owner, card.plan)).failed);
      assert.equal((await put(P.owner.userId, `/games/${paidTwin}`, { priceType: 'TOTAL', priceTotal: 30, priceCurrency: 'EUR' })).status, 200);
      await getGameCostSummary(paid, P.owner.userId);
      await getGameCostSummary(paidTwin, P.owner.userId);
      assert.deepEqual(await shareState(paid, P.player.userId), await shareState(paidTwin, P.player.userId));
      assert.equal((await shareRow(paid, P.player.userId))?.amountCents, (await shareRow(paidTwin, P.player.userId))?.amountCents);

      // A coin-paid share → critical; removing the price warns about the refund.
      const coin = await proposeCall('set_game_price', P.owner, { gameId: coinPaidGame, priceType: 'TOTAL', amount: 50 });
      assert.equal(coin.tier, 'critical', 'a coin share escalates');
      assert.ok(warnings(coin.preview!).includes(t('warn.coinSharesFixed', { count: '1' })));
      const remove = await proposeCall('set_game_price', P.owner, { gameId: coinPaidGame, priceType: 'NOT_KNOWN' });
      assert.equal(remove.tier, 'critical');
      assert.ok(warnings(remove.preview!).includes(t('warn.coinRefund', { count: '1' })));

      // Removing the price with shares → critical; the ledger goes away, as over HTTP.
      const removed = await priced('Price removed');
      const removedTwin = await priced('Price removed twin');
      const rm = await proposeCall('set_game_price', P.owner, { gameId: removed, priceType: 'FREE' });
      assert.equal(rm.tier, 'critical');
      assert.deepEqual(lineTo(rm.preview!, EN['field.price'])?.to, EN['value.priceFree']);
      assert.ok(!(await confirm('set_game_price', P.owner, rm.plan)).failed);
      assert.equal((await put(P.owner.userId, `/games/${removedTwin}`, { priceType: 'FREE', priceTotal: null, priceCurrency: null })).status, 200);
      await getGameCostSummary(removedTwin, P.owner.userId);
      assert.deepEqual(await priceRow(removed), await priceRow(removedTwin));
      assert.equal(await shareRows(removed), 0);
      assert.equal(await shareRows(removedTwin), 0);

      // Escalated calls never auto-approve, even with ALWAYS_ALLOW; standard ones do.
      await prisma.agentToolPermission.create({ data: { userId: P.owner.userId, toolName: 'set_game_price', mode: AgentToolPermissionMode.ALWAYS_ALLOW } });
      try {
        const esc = await priced('Price auto escalated');
        const executed = await registry.executeTool(await writeCtx(P.owner), 'set_game_price', { gameId: esc, priceType: 'NOT_KNOWN' });
        assert.ok(executed.awaitingConfirmation);
        assert.equal(await autoApproveAgentAction(registry, executed.awaitingConfirmation.actionId, new Date()), null, 'escalated: never auto-approved');
        assert.equal((await priceRow(esc)).priceType, 'TOTAL');
        await expirePending();
        const std = await priced('Price auto standard');
        const executed2 = await registry.executeTool(await writeCtx(P.owner), 'set_game_price', { gameId: std, priceType: 'TOTAL', amount: 44 });
        assert.ok(executed2.awaitingConfirmation);
        const auto = await autoApproveAgentAction(registry, executed2.awaitingConfirmation.actionId, new Date());
        assert.equal(auto?.action.status, AgentActionStatus.EXECUTED, 'standard + always allow auto-approves');
        assert.equal((await priceRow(std)).priceTotal, 44);
      } finally {
        await prisma.agentToolPermission.deleteMany({ where: { userId: P.owner.userId, toolName: 'set_game_price' } });
        await expirePending();
      }
      console.log('set_game_price escalation / removal / auto-approve: ok');
    }
    {
      // Locks: results started or archived → refused (as PUT /games/:id); leagues → handoff.
      const started = await priced('Price results started');
      await prisma.game.update({ where: { id: started }, data: { resultsStatus: ResultsStatus.IN_PROGRESS } });
      const lockedOut = await proposeCall('set_game_price', P.owner, { gameId: started, priceType: 'TOTAL', amount: 50 });
      assert.equal(err(lockedOut.result), 'bad_request', JSON.stringify(lockedOut.result.data));
      assert.equal((await put(P.owner.userId, `/games/${started}`, { priceType: 'TOTAL', priceTotal: 50, priceCurrency: 'EUR' })).status, 400);
      const archived = await priced('Price archived');
      await prisma.game.update({ where: { id: archived }, data: { status: GameStatus.ARCHIVED } });
      assert.equal(err((await proposeCall('set_game_price', P.owner, { gameId: archived, priceType: 'TOTAL', amount: 50 })).result), 'bad_request');
      assert.equal((await put(P.owner.userId, `/games/${archived}`, { priceType: 'TOTAL', priceTotal: 50, priceCurrency: 'EUR' })).status, 400);
      for (const g of [started, archived]) assert.equal((await priceRow(g)).priceTotal, 40);

      // Results start between propose and confirm → refused at authorize, price unchanged.
      const late = await priced('Price late lock');
      const card = await propose('set_game_price', P.owner, { gameId: late, priceType: 'TOTAL', amount: 50 });
      await prisma.game.update({ where: { id: late }, data: { resultsStatus: ResultsStatus.IN_PROGRESS } });
      assert.equal(await statusOf(() => confirm('set_game_price', P.owner, card.plan)), 400);
      assert.equal((await priceRow(late)).priceTotal, 40);

      const season = await mkGame(
        'Price season',
        { entityType: EntityType.LEAGUE_SEASON, isPublic: false, priceType: 'PER_PERSON', priceTotal: 10, priceCurrency: 'EUR' },
        [['leagueOwner', ParticipantRole.OWNER, ParticipantStatus.NON_PLAYING]],
      );
      const fixtureGame = await mkGame('Price fixture', { entityType: EntityType.LEAGUE, parentId: season, priceType: 'NOT_KNOWN' }, [
        ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
      ]);
      for (const g of [fixtureGame, season]) {
        const out = await proposeCall('set_game_price', P.leagueOwner, { gameId: g, priceType: 'PER_PERSON', amount: 12 });
        assert.equal(err(out.result), 'league_price', JSON.stringify(out.result.data));
        assert.equal((out.result.data as Json).message, EN['refuse.leaguePrice']);
        assert.ok(out.result.entities?.some((e) => e.type === 'handoff' && e.url === `/games/${g}`));
      }
      assert.deepEqual(await priceRow(season), { priceType: 'PER_PERSON', priceTotal: 10, priceCurrency: 'EUR' });
      assert.equal((await priceRow(fixtureGame)).priceType, 'NOT_KNOWN');

      // Stale: the price moved, or a share got paid, after the card → nothing written.
      const moved = await priced('Price stale moved');
      const c1 = await propose('set_game_price', P.owner, { gameId: moved, priceType: 'TOTAL', amount: 50 });
      await prisma.game.update({ where: { id: moved }, data: { priceTotal: 45 } });
      const s1 = await confirm('set_game_price', P.owner, c1.plan);
      assert.deepEqual(s1.failed, { changed: false });
      assert.equal((await priceRow(moved)).priceTotal, 45);
      const paidLater = await priced('Price stale paid');
      const c2 = await propose('set_game_price', P.owner, { gameId: paidLater, priceType: 'TOTAL', amount: 50 });
      assert.equal((await post(P.player.userId, `/games/${paidLater}/cost-shares/me/paid`, { method: 'MANUAL' })).status, 200);
      const s2 = await confirm('set_game_price', P.owner, c2.plan);
      assert.deepEqual(s2.failed, { changed: false }, 'a share paid after a standard card → stale');
      assert.equal((await priceRow(paidLater)).priceTotal, 40);

      // Lost role between propose and confirm → 403, price unchanged.
      const demoted = await priced('Price lost role');
      const c3 = await propose('set_game_price', P.gameAdmin, { gameId: demoted, priceType: 'TOTAL', amount: 50 });
      await prisma.gameParticipant.updateMany({ where: { gameId: demoted, userId: P.gameAdmin.userId }, data: { role: ParticipantRole.PARTICIPANT } });
      assert.equal(await statusOf(() => confirm('set_game_price', P.gameAdmin, c3.plan)), 403);
      assert.equal((await priceRow(demoted)).priceTotal, 40);
      console.log('set_game_price locks / league / stale / lost role: ok');
    }

    // --- 10f: remind_unpaid_shares ---------------------------------------------------------
    {
      const expected: Record<AgentMatrixActor, ['C' | 'F', number]> = {
        stranger: ['F', 403],
        invited: ['F', 403],
        queued: ['F', 403],
        player: ['F', 403],
        gameAdmin: ['C', 200],
        owner: ['C', 200],
        leagueOwner: ['F', 403],
        globalAdmin: ['C', 200],
      };
      for (const [actor, [kind, httpStatus]] of Object.entries(expected) as [AgentMatrixActor, ['C' | 'F', number]][]) {
        const agentGame = await priced(`Remind matrix A ${actor}`);
        const httpGame = await priced(`Remind matrix H ${actor}`);
        const out = await proposeCall('remind_unpaid_shares', P[actor], { gameId: agentGame });
        if (kind === 'C') {
          assert.ok(out.plan, `${actor}: card (${JSON.stringify(out.result.data)})`);
          assert.equal(await getRemindAvailableAt(agentGame), null, `${actor}: nothing sent at propose`);
          const outcome = await confirm('remind_unpaid_shares', P[actor], out.plan);
          assert.ok(!outcome.failed, `${actor}: ${outcome.message}`);
          assert.equal(outcome.message, t('result.reminded', { count: '2' }));
        } else {
          assert.equal(err(out.result), 'forbidden', `${actor}: forbidden (${JSON.stringify(out.result.data)})`);
        }
        const res = await post(P[actor].userId, `/games/${httpGame}/cost-shares/remind`);
        assert.equal(res.status, httpStatus, `${actor}: HTTP ${res.status} ${res.message}`);
        assert.equal((await getRemindAvailableAt(agentGame)) != null, (await getRemindAvailableAt(httpGame)) != null, `${actor}: same cooldown state`);
      }
      console.log('remind_unpaid_shares matrix (propose + confirm = HTTP): ok');
    }
    {
      // The card lists who is reminded; then the cooldown refuses without a card (HTTP 429).
      const gameId = await priced('Remind card');
      const [playerName, adminName] = [await nameIn(gameId, P.player.userId), await nameIn(gameId, P.gameAdmin.userId)];
      const card = await propose('remind_unpaid_shares', P.owner, { gameId });
      assert.equal(card.preview.title, t('preview.remind.title', { game: `Remind card ${s}` }));
      const shown = lineTo(card.preview, EN['field.players'])?.to ?? '';
      assert.ok(shown.includes(playerName) && shown.includes(adminName), shown);
      assert.equal(lineTo(card.preview, EN['field.unpaid'])?.to, t('value.countOf', { count: '2', total: '3' }));
      assert.equal(lineTo(card.preview, EN['field.outstanding'])?.to, '€26.66');
      assert.deepEqual(warnings(card.preview), [EN['warn.remindPush'], EN['warn.remindCooldown']]);
      assert.deepEqual(card.plan, { gameId, recipientIds: [P.gameAdmin.userId, P.player.userId].sort(), outstandingMinor: 2666, currency: 'EUR' });
      assert.ok(!(await confirm('remind_unpaid_shares', P.owner, card.plan)).failed);
      const cooldown = await proposeCall('remind_unpaid_shares', P.owner, { gameId });
      assert.equal(err(cooldown.result), 'remind_cooldown');
      assert.ok((cooldown.result.data as Json).availableAt, 'says when');
      assert.ok(String((cooldown.result.data as Json).message).startsWith('A reminder was already sent'));
      // Same refusal from the service (HTTP 429). Kept off HTTP: the route's IP limiter allows 10 per hour.
      await assert.rejects(remindUnpaidShares(gameId, P.gameAdmin.userId), (e: unknown) => e instanceof ApiError && e.statusCode === 429);

      // Cooldown race: the app nudges after the card → FAILED with the next time, nothing sent twice.
      const race = await priced('Remind race');
      const raceCard = await propose('remind_unpaid_shares', P.owner, { gameId: race });
      assert.equal((await remindUnpaidShares(race, P.gameAdmin.userId)).sent, 2, 'the app nudges first');
      const raced = await confirm('remind_unpaid_shares', P.owner, raceCard.plan);
      assert.deepEqual(raced.failed, { changed: false });
      assert.ok(raced.message.startsWith('A reminder was already sent'), raced.message);
      assert.ok((raced.modelData as Json).availableAt);

      // Stale: a player settles after the card → recipients changed, nothing sent.
      const stale = await priced('Remind stale');
      const staleCard = await propose('remind_unpaid_shares', P.owner, { gameId: stale });
      assert.equal((await post(P.owner.userId, `/games/${stale}/cost-shares/${P.player.userId}/confirm`, { confirmed: true })).status, 200);
      const staleOut = await confirm('remind_unpaid_shares', P.owner, staleCard.plan);
      assert.deepEqual(staleOut.failed, { changed: false });
      assert.equal(await getRemindAvailableAt(stale), null, 'no reminder claimed');

      // Nothing to remind once everyone settled.
      assert.equal((await post(P.owner.userId, `/games/${stale}/cost-shares/${P.gameAdmin.userId}/confirm`, { confirmed: true })).status, 200);
      assert.equal(err((await proposeCall('remind_unpaid_shares', P.owner, { gameId: stale })).result), 'nothing_to_remind');

      // Authorization before sync: a stranger's call writes no rows and stamps no payer.
      const fresh = await mkGame('Remind fresh', PRICE_40);
      assert.equal(err((await proposeCall('remind_unpaid_shares', P.stranger, { gameId: fresh })).result), 'forbidden');
      assert.equal(await shareRows(fresh), 0);
      assert.equal((await prisma.game.findUniqueOrThrow({ where: { id: fresh }, select: { costPayerId: true } })).costPayerId, null);

      // Manual reminders have no age limit (as in the app): a game frozen 10 days ago.
      const frozen = await priced('Remind frozen');
      await prisma.game.update({
        where: { id: frozen },
        data: { costFrozenAt: new Date(Date.now() - 10 * DAY), resultsStatus: ResultsStatus.FINAL, status: 'FINISHED', startTime: new Date(Date.now() - 10 * DAY - 2 * HOUR), endTime: new Date(Date.now() - 10 * DAY) },
      });
      const frozenCard = await propose('remind_unpaid_shares', P.owner, { gameId: frozen });
      assert.ok(!(await confirm('remind_unpaid_shares', P.owner, frozenCard.plan)).failed, 'frozen, 10 days old: still allowed');

      // Trainer (NON_PLAYING + ADMIN) may remind; a player who lost their admin role can't confirm.
      const training = await mkGame('Remind training', { ...PRICE_40, entityType: EntityType.TRAINING, trainerId: P.invited.userId }, [
        ['owner', ParticipantRole.OWNER, ParticipantStatus.PLAYING],
        ['player', ParticipantRole.PARTICIPANT, ParticipantStatus.PLAYING],
        ['invited', ParticipantRole.ADMIN, ParticipantStatus.NON_PLAYING],
      ]);
      const tc = await propose('remind_unpaid_shares', P.invited, { gameId: training });
      assert.deepEqual((tc.plan as { recipientIds: string[] }).recipientIds, [P.player.userId], 'only the playing debtor');
      const demoted = await priced('Remind lost role');
      const dc = await propose('remind_unpaid_shares', P.gameAdmin, { gameId: demoted });
      await prisma.gameParticipant.updateMany({ where: { gameId: demoted, userId: P.gameAdmin.userId }, data: { role: ParticipantRole.PARTICIPANT } });
      assert.equal(await statusOf(() => confirm('remind_unpaid_shares', P.gameAdmin, dc.plan)), 403);
      assert.equal(await getRemindAvailableAt(demoted), null);
      console.log('remind_unpaid_shares card / cooldown / race / stale / frozen / trainer / lost role: ok');
    }

    console.log('agentMoney.integration.test.ts: ok');
  } finally {
    server.close();
    const fixtureUserIds = Object.values(P).map((p) => p.userId);
    const coinTx = { OR: [{ fromUserId: { in: fixtureUserIds } }, { toUserId: { in: fixtureUserIds } }] };
    await prisma.transactionRow.deleteMany({ where: { transaction: coinTx } }).catch((e) => console.error('transaction row cleanup failed', e));
    await prisma.transaction.deleteMany({ where: coinTx }).catch((e) => console.error('transaction cleanup failed', e));
    await prisma.agentChat.deleteMany({ where: { id: { in: chatIds } } }).catch((e) => console.error('chat cleanup failed', e));
    for (const id of [...gameIds].reverse()) {
      await prisma.game.deleteMany({ where: { id } }).catch((e) => console.error('game cleanup failed', e));
    }
    await fixture.cleanup().catch((e) => console.error('fixture cleanup failed', e));
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
