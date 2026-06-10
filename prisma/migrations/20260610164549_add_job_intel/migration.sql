-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "optimizeWithAi" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "intel" JSONB,
ADD COLUMN     "intelState" TEXT;
