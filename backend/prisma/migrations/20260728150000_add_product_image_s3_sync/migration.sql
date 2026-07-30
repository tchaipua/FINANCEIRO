ALTER TABLE "products" ADD COLUMN "imageS3SyncStatus" TEXT NOT NULL DEFAULT 'NOT_TRACKED';
ALTER TABLE "products" ADD COLUMN "imageS3ObjectKey" TEXT;
ALTER TABLE "products" ADD COLUMN "imageS3LastError" TEXT;
ALTER TABLE "products" ADD COLUMN "imageS3SyncedAt" DATETIME;

CREATE INDEX "products_companyId_branchCode_imageS3SyncStatus_idx"
ON "products"("companyId", "branchCode", "imageS3SyncStatus");
