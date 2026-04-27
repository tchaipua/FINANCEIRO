-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN "billingAcceptanceCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingContractNumber" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingDistributionTypeCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingDocumentSpeciesCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingIssueTypeCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingModalityCode" TEXT;
ALTER TABLE "bank_accounts" ADD COLUMN "billingNextBoletoNumber" INTEGER;
ALTER TABLE "bank_accounts" ADD COLUMN "billingRegisterPixCode" INTEGER;

-- AlterTable
ALTER TABLE "parties" ADD COLUMN "addressLine1" TEXT;
ALTER TABLE "parties" ADD COLUMN "neighborhood" TEXT;
ALTER TABLE "parties" ADD COLUMN "city" TEXT;
ALTER TABLE "parties" ADD COLUMN "state" TEXT;
ALTER TABLE "parties" ADD COLUMN "postalCode" TEXT;

-- AlterTable
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipStatus" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipMessage" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipProvider" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipOurNumber" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipYourNumber" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipDigitableLine" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipBarcode" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipQrCode" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipPdfBase64" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipPayloadJson" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipResponseJson" TEXT;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipIssuedAt" DATETIME;
ALTER TABLE "receivable_installments" ADD COLUMN "bankSlipIssuedBy" TEXT;
