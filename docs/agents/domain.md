# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — lists each context and where its `CONTEXT.md` lives. Read the map first, then each context relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.
- **Per-context ADRs** — also check `<context>/docs/adr/` for context-scoped decisions (e.g. `Backend/docs/adr/`).

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Multi-context monorepo:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                              ← system-wide decisions
├── Backend/
│   ├── CONTEXT.md                         ← API, services, Prisma, scoring
│   └── docs/adr/
├── Frontend/
│   ├── CONTEXT.md                         ← React web app
│   └── docs/adr/
├── Admin/
│   └── CONTEXT.md                         ← admin panel
└── Frontend/ios/App/BandejaWatch Watch App/
    └── CONTEXT.md                         ← Apple Watch scoring app
```

Infer which context the current topic relates to from the map. If unclear, ask.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in the relevant `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
