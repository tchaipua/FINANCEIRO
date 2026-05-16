ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "originalAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "additionAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "discountAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "finalAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'OPEN';

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "paymentMethod" TEXT;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "settledAt" DATETIME;

ALTER TABLE "payable_invoice_import_installments"
ADD COLUMN "notes" TEXT;

UPDATE "payable_invoice_import_installments"
SET
  "originalAmount" = "amount",
  "additionAmount" = 0,
  "discountAmount" = 0,
  "finalAmount" = "amount"
WHERE "originalAmount" = 0
  AND "finalAmount" = 0;

ALTER TABLE "payable_installments"
ADD COLUMN "originalAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_installments"
ADD COLUMN "additionAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_installments"
ADD COLUMN "discountAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_installments"
ADD COLUMN "finalAmount" REAL NOT NULL DEFAULT 0;

ALTER TABLE "payable_installments"
ADD COLUMN "paymentMethod" TEXT;

ALTER TABLE "payable_installments"
ADD COLUMN "settledAt" DATETIME;

ALTER TABLE "payable_installments"
ADD COLUMN "notes" TEXT;

UPDATE "payable_installments"
SET
  "originalAmount" = "amount",
  "additionAmount" = 0,
  "discountAmount" = 0,
  "finalAmount" = "amount"
WHERE "originalAmount" = 0
  AND "finalAmount" = 0;
