-- DropIndex
DROP INDEX "customers_email_idx";

-- DropIndex
DROP INDEX "customers_phone_idx";

-- CreateIndex
CREATE INDEX "orders_customerId_status_createdAt_idx" ON "orders"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_customerId_status_planId_createdAt_idx" ON "orders"("customerId", "status", "planId", "createdAt");

-- CreateIndex
CREATE INDEX "point_ledgers_customerId_createdAt_idx" ON "point_ledgers"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "translation_blocks_documentId_status_idx" ON "translation_blocks"("documentId", "status");

-- CreateIndex
CREATE INDEX "translation_documents_customerId_status_idx" ON "translation_documents"("customerId", "status");

