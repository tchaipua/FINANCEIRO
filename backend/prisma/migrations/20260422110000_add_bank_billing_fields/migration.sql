-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "billingApiClientId" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingApiClientSecret" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingBeneficiaryCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingCertificateBase64" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingCertificatePassword" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingDefaultDiscountPercent" REAL;
ALTER TABLE "bank_accounts" ADD COLUMN "billingDefaultFinePercent" REAL;
ALTER TABLE "bank_accounts" ADD COLUMN "billingDefaultInterestPercent" REAL;
ALTER TABLE "bank_accounts" ADD COLUMN "billingEnvironment" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingInstructionLine1" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingInstructionLine2" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingNegativeDays" INTEGER;
ALTER TABLE "bank_accounts" ADD COLUMN "billingProtestDays" INTEGER;
ALTER TABLE "bank_accounts" ADD COLUMN "billingProvider" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingWalletVariation" TEXT;
