# Historical migration SQL

One-time data backfills from migrations squashed into
`prisma/migrations/20261006200000_baseline`. Every existing database already ran
them; they are **not** migrations and never run on deploy. Kept verbatim because
tests exercise their logic and code comments point at them.
