# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`docs/APP_FUNCTIONALITY.md`** — product behavior, glossary (§2.1), architecture constraints (§2.2), shared packages (§2.3)
- **`docs/README.md`** — index of all current docs

If a referenced file doesn't exist, **proceed silently**. Don't flag absence; don't suggest creating docs upfront. The producer skill (`/grill-with-docs`) creates `CONTEXT.md` / ADRs lazily only when a hard-to-reverse trade-off needs recording — prefer updating §2.2 in `APP_FUNCTIONALITY.md` for ongoing constraints.

## Optional CONTEXT.md layout

Skills that look for per-area glossaries may use this layout when files exist:

```
/
├── Backend/CONTEXT.md
├── Frontend/CONTEXT.md
├── Admin/CONTEXT.md
└── Frontend/ios/.../BandejaWatch/.../CONTEXT.md
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in `docs/APP_FUNCTIONALITY.md` §2.1 (or a local `CONTEXT.md` if present).

## Flag constraint conflicts

If your output contradicts §2.2, surface it explicitly rather than silently overriding.
