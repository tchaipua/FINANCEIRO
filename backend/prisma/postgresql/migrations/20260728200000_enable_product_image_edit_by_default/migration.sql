ALTER TABLE "company_branches"
ALTER COLUMN "allowProductImageEdit" SET DEFAULT true;

UPDATE "company_branches"
SET "allowProductImageEdit" = true
WHERE "allowProductImageEdit" = false;
