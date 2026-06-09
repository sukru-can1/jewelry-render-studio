-- T-05-01: one job = exactly one layer. Additive unique constraint enables
-- prisma.layer.upsert({where:{jobId}}) to be idempotent against duplicate/late
-- webhooks. Safe: zero existing Layer rows at apply time (no creator shipped yet).

-- CreateIndex
CREATE UNIQUE INDEX "Layer_jobId_key" ON "Layer"("jobId");
