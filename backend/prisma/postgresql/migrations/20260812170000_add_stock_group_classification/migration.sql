ALTER TABLE "company_branches"
  ADD COLUMN "stockClassificationMode" TEXT NOT NULL DEFAULT 'GROUP_ONLY';

ALTER TABLE "products"
  ADD COLUMN "groupId" TEXT,
  ADD COLUMN "subgroupId" TEXT;

CREATE TABLE "product_groups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,
    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_subgroups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchCode" INTEGER NOT NULL DEFAULT 1,
    "groupId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "updatedBy" TEXT,
    "canceledAt" TIMESTAMPTZ(3),
    "canceledBy" TEXT,
    CONSTRAINT "product_subgroups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_groups_companyId_branchCode_name_key" ON "product_groups"("companyId", "branchCode", "name");
CREATE INDEX "product_groups_companyId_branchCode_status_name_idx" ON "product_groups"("companyId", "branchCode", "status", "name");
CREATE UNIQUE INDEX "product_subgroups_companyId_branchCode_groupId_name_key" ON "product_subgroups"("companyId", "branchCode", "groupId", "name");
CREATE INDEX "product_subgroups_companyId_branchCode_status_name_idx" ON "product_subgroups"("companyId", "branchCode", "status", "name");
CREATE INDEX "product_subgroups_companyId_branchCode_groupId_idx" ON "product_subgroups"("companyId", "branchCode", "groupId");
CREATE INDEX "products_companyId_branchCode_groupId_idx" ON "products"("companyId", "branchCode", "groupId");
CREATE INDEX "products_companyId_branchCode_subgroupId_idx" ON "products"("companyId", "branchCode", "subgroupId");

ALTER TABLE "product_groups" ADD CONSTRAINT "product_groups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_subgroups" ADD CONSTRAINT "product_subgroups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_subgroups" ADD CONSTRAINT "product_subgroups_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "product_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_subgroupId_fkey" FOREIGN KEY ("subgroupId") REFERENCES "product_subgroups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
