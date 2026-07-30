ALTER TABLE "products"
  ADD COLUMN "imageS3SyncStatus" TEXT NOT NULL DEFAULT 'NOT_TRACKED',
  ADD COLUMN "imageS3ObjectKey" TEXT,
  ADD COLUMN "imageS3LastError" TEXT,
  ADD COLUMN "imageS3SyncedAt" TIMESTAMPTZ(3);

CREATE INDEX "products_companyId_branchCode_imageS3SyncStatus_idx"
ON "products"("companyId", "branchCode", "imageS3SyncStatus");
