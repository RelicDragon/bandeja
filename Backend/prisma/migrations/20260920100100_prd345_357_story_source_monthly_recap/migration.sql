-- AlterEnum
-- PostgreSQL refuses to use a newly added enum value inside the same transaction that added it
-- ("unsafe use of new value ... of enum type"). Prisma wraps each migration file in one
-- transaction, so `MONTHLY_RECAP` gets a migration of its own with nothing else in it. Every
-- migration that inserts, compares against or backfills `StorySourceType.MONTHLY_RECAP` — and all
-- application code for PRD 353 — must come after this file.
ALTER TYPE "StorySourceType" ADD VALUE 'MONTHLY_RECAP';
