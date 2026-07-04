-- DropIndex
DROP INDEX "orders_customerId_idx";

-- DropIndex
DROP INDEX "point_ledgers_customerId_idx";

-- CreateIndex
CREATE INDEX "orders_customerId_createdAt_idx" ON "orders"("customerId", "createdAt");

