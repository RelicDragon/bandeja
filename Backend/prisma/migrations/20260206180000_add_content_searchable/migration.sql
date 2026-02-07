CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "ChatMessage" ADD COLUMN "contentSearchable" TEXT;

CREATE INDEX "ChatMessage_contentSearchable_gin_idx" 
  ON "ChatMessage" USING gin ("contentSearchable" gin_trgm_ops) 
  WHERE "contentSearchable" IS NOT NULL AND "contentSearchable" != '';
