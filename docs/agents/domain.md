# Domain Docs

How skills and agents consume this repo's documentation.

## Before exploring, read these

1. **`docs/agents/RULES.md`** — mandatory contract (also loaded via `AGENTS.md` / `CLAUDE.md` / Cursor rule `docs-first`).
2. **`CONTEXT-MAP.md`** — where language lives. Do **not** start at root `CONTEXT.md` (league withdrawal only) or `docs/adr/` (unused).
3. **`docs/README.md`** — map. Pick the file for the task.
4. **`docs/product/glossary.md`** — vocabulary.
5. **`docs/product/constraints.md`** — load-bearing invariants. Same table at `docs/APP_FUNCTIONALITY.md` §2.2.
6. **`docs/architecture/code-map.md`** — where code lives.

Then open the matching `docs/domains/<area>.md`. Investigate flow: `docs/agents/how-to-investigate.md`.

If a referenced file does not exist, proceed from schema + sibling domain files. Prefer updating `docs/product/constraints.md` (and the §2.2 copy) over creating an ADR.

## Optional CONTEXT.md layout

```
/
├── CONTEXT-MAP.md                     this map
├── CONTEXT.md                         league withdrawal only
├── docs/product/glossary.md           product language
├── docs/product/constraints.md        do-not-simplify
└── Frontend/src/services/chat/CONTEXT.md
```

Do not add `Backend/CONTEXT.md` / `Frontend/CONTEXT.md` unless a new bounded language exists. Do not create `docs/adr/`.

## Use the glossary

When output names a domain concept, use `docs/product/glossary.md` (or the local CONTEXT file for that slice). Do not use `CLAUDE.md` as a spec.

Overloads:

- Product **Event** is only `EntityType.EVENT`. A `Game` row is not “an Event”.
- `Game.status` is `ANNOUNCED | STARTED | FINISHED | ARCHIVED`. League fixture UI labels `READY` / `SCHEDULED` are not this enum.
- **Home / Browse / Venue** are three city roles. Browse never calls `switchCity`.
- Only `ParticipantStatus.PLAYING` fills slots.
- Trainer is `Game.trainerId`, not a participant flag.

## Flag constraint conflicts

If output would contradict `docs/product/constraints.md`, say so instead of silently overriding.
