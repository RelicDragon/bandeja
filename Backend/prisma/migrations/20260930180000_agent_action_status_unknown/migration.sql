-- AlterEnum (own migration: ADD VALUE cannot share a transaction with its first use)
ALTER TYPE "AgentActionStatus" ADD VALUE 'UNKNOWN';
