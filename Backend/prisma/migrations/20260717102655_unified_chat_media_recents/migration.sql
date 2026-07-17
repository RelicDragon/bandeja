-- AlterTable
ALTER TABLE "UserStickerPrefs"
ADD COLUMN "recentMedia" JSONB NOT NULL DEFAULT '[]';

UPDATE "UserStickerPrefs"
SET "recentMedia" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object('kind', 'STICKER', 'stickerId', sticker_id)
      ORDER BY position
    )
    FROM unnest("recent") WITH ORDINALITY AS recent_sticker(sticker_id, position)
  ),
  '[]'::jsonb
);

ALTER TABLE "UserStickerPrefs"
DROP COLUMN "recent";
