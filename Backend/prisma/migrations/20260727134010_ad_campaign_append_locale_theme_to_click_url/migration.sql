-- AlterTable
ALTER TABLE "AdCampaign" ADD COLUMN     "appendLocaleToClickUrl" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "appendThemeToClickUrl" BOOLEAN NOT NULL DEFAULT false;
