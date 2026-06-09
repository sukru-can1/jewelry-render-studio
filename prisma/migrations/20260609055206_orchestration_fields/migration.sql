-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3),
ADD COLUMN     "result" JSONB,
ADD COLUMN     "startedAt" TIMESTAMP(3);
