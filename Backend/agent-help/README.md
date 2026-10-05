# Assistant help corpus

Hand-written app help for the in-app AI assistant (`get_help` / `list_help`, `Backend/src/services/agent/tools/help.tools.ts`). See `docs/domains/agent.md` "App help" for the format.

- `_index.md` lists every topic id; each topic is one `.md` file (`tasks/` = task guides).
- Double quotes are reserved for UI labels; each must be an English string from `Frontend/src/i18n/locales/en` (pin a key with `"Save"{common.save}` when the text is ambiguous).
- `<!-- audience: trainer, admin -->` right under a heading hides that section from users without one of those roles.
- When you change a file listed in a topic's `verified_against`, review the topic.
- Run `npm run check:agent-help` after editing (and `-- --write` to refresh `labels.json`).

This README is not shipped (`scripts/copy-agent-help.cjs` skips it) and is not a topic.
