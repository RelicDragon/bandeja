/**
 * 🔐 Permissions menu of the Telegram assistant (docs/domains/agent.md § Telegram channel,
 * plan §15 slice 8c). Pure renders; `agentBot.ts` loads / stores through the permission
 * service (`agentToolPermission.service.ts`) and edits the menu message in place.
 *
 *   - one button per write tool the user has (localized name + mode); a standard tool
 *     toggles Ask ↔ Always allow (`agent:perm:<tool>`, or `agent:permi:<index>` when the
 *     name would push the callback past 64 bytes); a critical tool shows 🔒 "always asks"
 *     and its tap is refused with an alert;
 *   - "Reset all" (`agent:preset`) asks first (`agent:preset:yes` / Back `agent:perms:edit`).
 */
import type { AgentToolPermissionDto } from '@bandeja/shared/agentContract';
import type { InlineKeyboardButton } from 'grammy/types';
import { agentBotT } from './agentBotCopy';
import { agentCallbackData, permToggleCallbackData } from './agentBotView';
import { escapeTelegramHtml } from './agentTelegramHtml';
import type { TelegramMessageRender } from './telegramEditThrottler';

function toolButtonText(tool: AgentToolPermissionDto, lang: string): string {
  if (!tool.canAlwaysAllow) return `🔒 ${tool.name} · ${agentBotT('perm.locked', lang)}`;
  return tool.mode === 'ALWAYS_ALLOW'
    ? `♾ ${tool.name} · ${agentBotT('perm.always', lang)}`
    : `❔ ${tool.name} · ${agentBotT('perm.ask', lang)}`;
}

export function renderPermissionsMenu(tools: AgentToolPermissionDto[], lang: string): TelegramMessageRender {
  const header = `🔐 <b>${escapeTelegramHtml(agentBotT('perm.title', lang))}</b>`;
  if (tools.length === 0) {
    return { html: `${header}\n\n${escapeTelegramHtml(agentBotT('perm.empty', lang))}`, keyboard: { inline_keyboard: [] } };
  }
  const rows: InlineKeyboardButton[][] = tools.map((tool, index) => [
    { text: toolButtonText(tool, lang), callback_data: permToggleCallbackData(tool.toolName, index) },
  ]);
  rows.push([{ text: agentBotT('perm.resetAll', lang), callback_data: agentCallbackData({ kind: 'permReset', confirmed: false }) }]);
  return {
    html: `${header}\n\n${escapeTelegramHtml(agentBotT('perm.hint', lang))}`,
    keyboard: { inline_keyboard: rows },
  };
}

export function renderPermissionsResetConfirm(lang: string): TelegramMessageRender {
  return {
    html: `🔐 <b>${escapeTelegramHtml(agentBotT('perm.resetConfirm', lang))}</b>`,
    keyboard: {
      inline_keyboard: [
        [
          { text: agentBotT('perm.back', lang), callback_data: agentCallbackData({ kind: 'perms', edit: true }) },
          { text: agentBotT('perm.resetYes', lang), callback_data: agentCallbackData({ kind: 'permReset', confirmed: true }) },
        ],
      ],
    },
  };
}
