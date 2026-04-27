import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ListBanksDto {
  @IsOptional()
  @IsString()
  embedded?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  cashierUserId?: string;

  @IsOptional()
  @IsString()
  cashierDisplayName?: string;
}

export class ChangeBankStatusDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class GetBankDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class SaveBankDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyDocument?: string;

  @IsString()
  bankCode!: string;

  @IsString()
  bankName!: string;

  @IsString()
  branchNumber!: string;

  @IsOptional()
  @IsString()
  branchDigit?: string;

  @IsString()
  accountNumber!: string;

  @IsOptional()
  @IsString()
  accountDigit?: string;

  @IsOptional()
  @IsString()
  walletCode?: string;

  @IsOptional()
  @IsString()
  agreementCode?: string;

  @IsOptional()
  @IsString()
  pixKey?: string;

  @IsOptional()
  @IsString()
  beneficiaryName?: string;

  @IsOptional()
  @IsString()
  beneficiaryDocument?: string;

  @IsOptional()
  @IsString()
  billingProvider?: string;

  @IsOptional()
  @IsString()
  billingEnvironment?: string;

  @IsOptional()
  @IsString()
  billingApiClientId?: string;

  @IsOptional()
  @IsString()
  billingApiClientSecret?: string;

  @IsOptional()
  @IsString()
  billingCertificateBase64?: string;

  @IsOptional()
  @IsString()
  billingCertificatePassword?: string;

  @IsOptional()
  @IsString()
  billingBeneficiaryCode?: string;

  @IsOptional()
  @IsString()
  billingWalletVariation?: string;

  @IsOptional()
  @IsString()
  billingContractNumber?: string;

  @IsOptional()
  @IsString()
  billingModalityCode?: string;

  @IsOptional()
  @IsString()
  billingDocumentSpeciesCode?: string;

  @IsOptional()
  @IsString()
  billingAcceptanceCode?: string;

  @IsOptional()
  @IsString()
  billingIssueTypeCode?: string;

  @IsOptional()
  @IsString()
  billingDistributionTypeCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingNextBoletoNumber?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingRegisterPixCode?: number;

  @IsOptional()
  @IsString()
  billingInstructionLine1?: string;

  @IsOptional()
  @IsString()
  billingInstructionLine2?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingDefaultFinePercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingDefaultInterestPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingDefaultDiscountPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingProtestDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  billingNegativeDays?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
