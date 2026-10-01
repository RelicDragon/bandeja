# AI agent: Phase 11, Memory (design, 2026-10-01)

Parent plan: [ai-agent.md](./ai-agent.md). Status: **phases 1–3 built (2026-10-01); phase 4 see §11.5.** Owner: relic. Behavior as built: [domains/agent.md § Memory](../domains/agent.md#memory-phase-11-agentmemoryservicets-toolsmemorytoolsts).

The agent remembers durable facts about the signed-in user across chats, the way Claude and Codex do: a small index always in the prompt, full bodies read on demand, written by the model itself, fully visible and editable by the user.

## 11.1 Decisions

1. **The model saves memories on its own by default** (`source = MODEL_INFERRED`), and the user can also add their own (`USER_ASKED`).
2. **One master switch, `agentMemoryEnabled`, default ON.** It lives in the Memory tab of the assistant settings modal.
3. **Opt-out is total.** When OFF the server does not read memory into the prompt, does not list the memory tools to the model, rejects `save_memory`/`read_memory` handlers if called anyway, and runs no consolidation over that user's rows. Stored items are kept, but dormant and still visible in the tab so the user can delete them. Turning the switch ON again resumes use.
4. **Memory never grants privilege.** It cannot relax confirmation, change permissions, or alter tool filtering. It only shapes tone, defaults and context (non-negotiable 1 and 3 of the parent plan still hold).
5. **Do not store what tools return live:** games, rosters, balances, results. Do not store data about other users, contact details or secrets.

## 11.2 Data model

`AgentMemory`: `id`, `userId` (cascade), `name` (internal slug, unique per user), `description` (one line), `body` (≤ 500 chars), `type` `PREFERENCE | FEEDBACK | FACT`, `source` `USER_ASKED | MODEL_INFERRED`, `createdAt`, `updatedAt`, `lastUsedAt`. `@@unique([userId, name])`, cap 50 per user. New enums only (no `ADD VALUE`).

The switch is a column on the user's agent settings (`agentMemoryEnabled Boolean @default(true)`); put it where the per-user agent preferences already live, or on `User` if none exists. Named migration via `npm run prisma:migrate`.

## 11.3 Backend

- One `agentMemory.service.ts` used by both HTTP routes and model tools. It enforces the cap, the length limit, a secrets/contact-data check, upsert-by-name, and the master switch.
- `buildAgentRunContext` adds a "What you remember about this user" section **only when the switch is ON**: index lines (`name: description`), most recently used first, capped around 800 tokens, framed as quoted data, not instructions.
- Tools (user scope; no `userId` argument; not listed when the switch is OFF): `list_memories`, `read_memory(name)` (bumps `lastUsedAt`), `save_memory(name, description, body, type)`, `forget_memory(name)`.
- **Provenance guard:** `save_memory` is refused in a run where untrusted content (for example `summarize_game_chat` output) entered the context, unless the latest user message asked for it. This blocks stored prompt injection.
- Model-inferred saves skip the confirmation card (low risk, self-scoped) but emit a `memory.saved` chip event with Undo.

### HTTP (own rows only, next to `/permissions`)

| Route | Purpose |
|---|---|
| `GET /agent/memory` | `{ enabled, items[] }` |
| `PUT /agent/memory/settings` | `{ enabled }` |
| `POST /agent/memory/items` | add `{ text }` (server derives name/description) |
| `PATCH /agent/memory/items/:id` | edit text |
| `DELETE /agent/memory/items/:id` | remove one |
| `DELETE /agent/memory/items` | remove all |

Item writes while the switch is OFF are allowed for delete and clear, rejected for add and edit (409), so the UI can disable them with the same rule.

## 11.4 Frontend

The existing dialog `AgentPermissionsScreen.tsx` becomes "Assistant settings" with two tabs: **Permissions** (unchanged) and **Memory**. `openAgentPermissionsScreen(initialTab?)` lets the "Saved to memory · Undo" chip deep-link to Memory.

Memory tab, top to bottom:

- **Switch row** "Allow memory", default ON. Small text under it: memory is sent to our LLM provider with your requests so the assistant can answer in the best way possible; turning it off stops saving and using memory.
- **List** (dimmed while OFF): description as title, body secondary, badge `You added` / `Learned`, trash icon (immediate delete with Undo toast), tap to edit inline.
- **Add memory**: inline form, one field, 500-char counter, pinned above the software keyboard, animated open. Disabled while OFF.
- **Remove all** (danger, `ConfirmationModal`), disabled when empty.
- Empty state with two example memories.

Wiring: `AgentMemoryDto` in `Frontend/shared/agentContract.ts`; `agentApi` methods; `queryKeys.agent.memory(userId)`; `useAgentMemory.ts` beside `useAgentPermissions.ts` (optimistic toggle/delete with rollback, query enabled only while the dialog is open); i18n `agent.memory.*` in all locales; split the dialog body into `AgentPermissionsTab` and `AgentMemoryTab`.

## 11.5 Phases

1. **Built.** Schema + migration (`20261001053000_agent_memory`; the switch is `User.agentMemoryEnabled`, there is no per-user agent settings table), `agentMemory.service.ts`, routes, tools, master switch enforcement, tests (switch OFF: no prompt section, no tools, handler refuses).
2. **Built.** Prompt index section, provenance guard, `memory.saved` event.

   As built (phases 1–2): the memory tools are a third tool kind, `kind: 'memory'` (self-scoped, no card, no risk tier, not in rule 6 or the permissions list; hidden unless `principal.agentMemoryEnabled`, and every handler re-checks the switch in the DB → 409 `MEMORY_DISABLED`). `forget_memory` and `list_memories` also refuse while OFF; the user deletes dormant notes in the app. A model save in reply to an explicit "remember…" is stored as `USER_ASKED`, otherwise `MODEL_INFERRED`. The provenance guard is chat-wide, not only per run: any `untrustedContent` call in the chat's history taints later runs too (folded turns can still paraphrase other people's text); "the user asked" = explicit remember wording in the latest user message, per app language (`userAskedToRemember`). Tests: `npm run test:agent-memory` (in `test:agent`).
3. **Built.** Settings modal tabs, memory tab, chip + Undo, i18n, `docs/UI_TEST_PLAN.md` (AI-46…AI-53), `docs/domains/agent.md`. As built: `memory.saved` carries the `callId` (the chip sits under that tool step); Undo of a delete in the tab is `POST /agent/memory/items {text, restore: {name, description, type, source}}` so a Learned note comes back as Learned; Telegram shows one "Saved to memory" line per save (no Undo there, the line points to the app).
4. Rolling chat summary (replaces the crude fold in `agentContext.service.ts`; chat-scoped, not memory), then a weekly consolidation job that skips opted-out users.

## 11.6 Decided

- Default stays ON, no first-use prompt. The disclosure is the small text under the switch (above). A privacy-policy line can follow the parent plan §11.3 work and is not a blocker. **Done with phases 1–2:** §1.10 "What we send" of the privacy policy (`Frontend/public/eula/world/eula-content-*.js`, 10 languages) lists the assistant's memory.
