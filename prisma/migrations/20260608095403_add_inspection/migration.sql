-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "runpodJobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'in_queue',
    "inventory" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Inspection_productId_idx" ON "Inspection"("productId");

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
