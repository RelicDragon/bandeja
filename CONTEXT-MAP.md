# Context map

Skills that look for `CONTEXT.md` or `docs/adr/` start **here**. This is a multi-doc repo, not a single glossary plus ADR folder.

## Contexts

| Context | File | What it is |
|---------|------|------------|
| Product language | [`docs/product/glossary.md`](docs/product/glossary.md) | Canonical terms and enums |
| Constraints | [`docs/product/constraints.md`](docs/product/constraints.md) | Do-not-simplify (also `docs/APP_FUNCTIONALITY.md` §2.2) |
| Doc map | [`docs/README.md`](docs/README.md) | Where every other doc lives |
| Agent contract | [`docs/agents/RULES.md`](docs/agents/RULES.md) | Mandatory read order |
| League withdrawal | [`CONTEXT.md`](./CONTEXT.md) | Fixed-team season withdraw vocabulary only |
| Chat open thread | [`Frontend/src/services/chat/CONTEXT.md`](Frontend/src/services/chat/CONTEXT.md) | Live projection vs Dexie vs unread |

## Relationships

- **Glossary → all work**: name entities as in `docs/product/glossary.md`. Root `CONTEXT.md` does not define Game, Event, city roles, or chat.
- **Constraints → implementation**: if a plan contradicts `docs/product/constraints.md`, surface it. Do not create `docs/adr/` for that — append the constraint.
- **Domain files**: behavior lives in `docs/domains/<area>.md`. Code paths in `docs/architecture/code-map.md`.

## Do not

- Treat root `CONTEXT.md` as the product glossary.
- Scan `docs/adr/` (unused). Record invariants in `docs/product/constraints.md`.
- Invent `Backend/CONTEXT.md` / `Frontend/CONTEXT.md` unless a new bounded language actually exists.
