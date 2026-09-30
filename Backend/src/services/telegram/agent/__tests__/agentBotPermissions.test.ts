/**
 * Phase 8c renders (pure): the 3-button confirmation card (standard vs critical), the
 * "Done automatically" line, the 🔐 Permissions menu, callback data ≤ 64 bytes for every
 * current write tool, and copy parity for the new strings.
 */
import assert from 'node:assert/strict';
import type { AgentPendingActionDto, AgentToolPermissionDto } from '@bandeja/shared/agentContract';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { AGENT_TOOL_PERMISSION_I18N_EN } from '../../../agent/i18n/agentToolPermissionI18n';
import { AGENT_BOT_COPY_KEYS, AGENT_BOT_LANGUAGES, agentBotT } from '../agentBotCopy';
import { renderPermissionsMenu, renderPermissionsResetConfirm } from '../agentBotPermissions';
import {
  agentCallbackData,
  callbackDataFits,
  initialAgentBotRunState,
  parseAgentCallback,
  permToggleCallbackData,
  renderAgentActionCard,
  renderAgentBotFinal,
} from '../agentBotView';

function action(overrides: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto {
  return {
    id: 'cmg1x2y3z0000abcdefghijkl',
    chatId: 'chat_1',
    runId: 'run_1',
    toolName: 'update_game',
    status: 'PENDING',
    preview: { title: 'Change game', lines: [], warnings: [] },
    expiresAt: '2026-09-30T10:15:00.000Z',
    result: null,
    createdAt: '2026-09-30T10:00:00.000Z',
    autoApproved: false,
    riskTier: 'standard',
    canAlwaysAllow: true,
    execution: 'server',
    ...overrides,
  };
}

function callbackRows(keyboard: InlineKeyboardMarkup | undefined): string[][] {
  return (keyboard?.inline_keyboard ?? []).map((row) => row.map((b) => ('callback_data' in b ? b.callback_data : '')));
}

function testCardLayout(): void {
  const standard = renderAgentActionCard(action(), 'en');
  const id = action().id;
  assert.deepEqual(callbackRows(standard.keyboard), [[`agent:reject:${id}`, `agent:confirm:${id}`], [`agent:always:${id}`]]);
  assert.deepEqual(
    standard.keyboard!.inline_keyboard.flat().map((b) => b.text),
    ['✖ Reject', '✅ Allow once', '♾ Always allow'],
  );

  const critical = renderAgentActionCard(
    action({ toolName: 'remove_participant', riskTier: 'critical', canAlwaysAllow: false }),
    'en',
  );
  assert.deepEqual(callbackRows(critical.keyboard), [[`agent:reject:${id}`, `agent:confirm:${id}`]], 'no Always allow');

  // An escalated standard tool (update_game making a game private) follows the call's flag.
  const escalated = renderAgentActionCard(action({ riskTier: 'critical', canAlwaysAllow: false }), 'ru');
  assert.equal(escalated.keyboard!.inline_keyboard.length, 1);
  assert.deepEqual(escalated.keyboard!.inline_keyboard[0].map((b) => b.text), ['✖ Отклонить', '✅ Разрешить один раз']);

  assert.deepEqual(parseAgentCallback(`agent:always:${id}`), { kind: 'always', actionId: id });
  assert.equal(parseAgentCallback('agent:always:../x'), null);
}

function testAutoApprovedLine(): void {
  const state = {
    ...initialAgentBotRunState('run_1'),
    committed: ['I invited them.'],
    actions: [
      action({ id: 'a1', toolName: 'invite_players', status: 'EXECUTED', autoApproved: true }),
      action({ id: 'a2', toolName: 'invite_players', status: 'EXECUTED', autoApproved: true }),
      action({ id: 'a3', toolName: 'join_game', status: 'FAILED', autoApproved: true }),
      action({ id: 'a4', toolName: 'leave_game', status: 'EXECUTED', autoApproved: false }),
    ],
    terminal: { kind: 'completed' as const, awaitingConfirmation: false },
  };
  const [final] = renderAgentBotFinal(state, 'en', { frontendUrl: 'https://bandeja.me', inlineUrlButtons: true });
  assert.match(final.html, /I invited them\./);
  const lines = final.html.match(/Done automatically/g) ?? [];
  assert.equal(lines.length, 1, 'one line per tool, only for executed auto-approved writes');
  assert.match(final.html, /✅ Done automatically \(you allowed “Invite players”\)\./);
  const [ru] = renderAgentBotFinal(state, 'ru', { frontendUrl: 'https://bandeja.me', inlineUrlButtons: true });
  assert.match(ru.html, /Выполнено автоматически/);

  const none = renderAgentBotFinal(
    { ...state, actions: [] },
    'en',
    { frontendUrl: 'https://bandeja.me', inlineUrlButtons: true },
  );
  assert.doesNotMatch(none[0].html, /Done automatically/);
}

function perm(toolName: string, name: string, mode: AgentToolPermissionDto['mode'], critical = false): AgentToolPermissionDto {
  return { toolName, name, description: '', riskTier: critical ? 'critical' : 'standard', mode, canAlwaysAllow: !critical };
}

function testPermissionsMenu(): void {
  const menu = renderPermissionsMenu(
    [
      perm('update_game', 'Edit <games>', 'ALWAYS_ALLOW'),
      perm('invite_players', 'Invite players', 'ASK'),
      perm('set_game_admin', 'Make admins', 'ASK', true),
    ],
    'en',
  );
  assert.match(menu.html, /🔐 <b>Assistant permissions<\/b>/);
  assert.deepEqual(
    menu.keyboard!.inline_keyboard.map((row) => row.map((b) => b.text)),
    [['♾ Edit <games> · Always allow'], ['❔ Invite players · Ask'], ['🔒 Make admins · always asks'], ['↺ Reset all']],
  );
  assert.deepEqual(callbackRows(menu.keyboard), [
    ['agent:perm:update_game'],
    ['agent:perm:invite_players'],
    ['agent:perm:set_game_admin'],
    ['agent:preset'],
  ]);
  const empty = renderPermissionsMenu([], 'en');
  assert.equal(empty.keyboard!.inline_keyboard.length, 0);
  assert.deepEqual(callbackRows(renderPermissionsResetConfirm('en').keyboard), [['agent:perms:edit', 'agent:preset:yes']]);
}

function testCallbackDataLimits(): void {
  const writeTools = Object.keys(AGENT_TOOL_PERMISSION_I18N_EN)
    .filter((key) => key.endsWith('.name'))
    .map((key) => key.slice(0, -'.name'.length));
  assert.ok(writeTools.length >= 10, 'every write tool has a permission name');
  for (const [index, toolName] of writeTools.entries()) {
    const data = permToggleCallbackData(toolName, index);
    assert.ok(callbackDataFits(data), `${data} ≤ 64 bytes`);
    assert.equal(data, `agent:perm:${toolName}`, 'current names fit by name');
    assert.deepEqual(parseAgentCallback(data), { kind: 'perm', tool: { name: toolName } });
  }
  // A future name too long for 64 bytes falls back to the list index.
  const long = 'a'.repeat(60);
  const fallback = permToggleCallbackData(long, 12);
  assert.equal(fallback, 'agent:permi:12');
  assert.deepEqual(parseAgentCallback(fallback), { kind: 'perm', tool: { index: 12 } });
  assert.equal(parseAgentCallback('agent:perm:Bad-Name'), null);
  assert.equal(parseAgentCallback('agent:permi:x'), null);
  assert.equal(parseAgentCallback('agent:preset:no'), null);
  assert.equal(parseAgentCallback('agent:perms:x'), null);

  const cuid = 'c'.repeat(40); // the longest id the parser accepts
  for (const kind of ['confirm', 'always', 'reject'] as const) {
    assert.ok(callbackDataFits(agentCallbackData({ kind, actionId: cuid })), kind);
  }
  for (const data of ['agent:perms', 'agent:perms:edit', 'agent:preset', 'agent:preset:yes']) {
    assert.ok(callbackDataFits(data));
    assert.ok(parseAgentCallback(data));
  }
}

function testCopyParity(): void {
  const placeholders = (text: string) => (text.match(/\{[a-z]+\}/gi) ?? []).sort().join(',');
  assert.equal(AGENT_BOT_LANGUAGES.length, 11);
  for (const key of AGENT_BOT_COPY_KEYS) {
    const en = agentBotT(key, 'en');
    for (const lang of AGENT_BOT_LANGUAGES) {
      const text = agentBotT(key, lang);
      assert.ok(text && text !== key, `${lang} ${key}`);
      assert.equal(placeholders(text), placeholders(en), `${lang} ${key} placeholders`);
    }
  }
}

testCardLayout();
testAutoApprovedLine();
testPermissionsMenu();
testCallbackDataLimits();
testCopyParity();
console.log('agentBotPermissions.test.ts: ok');
