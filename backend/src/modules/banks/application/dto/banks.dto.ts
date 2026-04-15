import { IsOptional, IsString } from "class-validator";

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
  notes?: string;
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
