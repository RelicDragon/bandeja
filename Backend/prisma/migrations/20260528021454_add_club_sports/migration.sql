-- AlterTable
ALTER TABLE "Club" ADD COLUMN     "sports" "Sport"[] DEFAULT ARRAY['PADEL']::"Sport"[];
