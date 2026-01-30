CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk"
USING hnsw ("embedding" vector_l2_ops);



-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "DocumentIngestionJob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentIngestionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentIngestionJob_documentId_key" ON "DocumentIngestionJob"("documentId");

-- CreateIndex
CREATE INDEX "DocumentIngestionJob_status_createdAt_idx" ON "DocumentIngestionJob"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "DocumentIngestionJob" ADD CONSTRAINT "DocumentIngestionJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
