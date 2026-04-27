import {
  Allow,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class ReceivableInstallmentImportDto {
  @IsInt()
  @Min(1)
  installmentNumber!: number;

  @IsInt()
  @Min(1)
  installmentCount!: number;

  @IsDateString()
  dueDate!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsString()
  sourceInstallmentKey!: string;
}

export class ReceivablePayerImportDto {
  @IsString()
  externalEntityType!: string;

  @IsString()
  externalEntityId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  document?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;
}

export class ReceivableItemImportDto {
  @IsString()
  sourceEntityType!: string;

  @IsString()
  sourceEntityId!: string;

  @IsOptional()
  @IsString()
  sourceEntityName?: string;

  @IsOptional()
  @IsString()
  classLabel?: string;

  @IsString()
  businessKey!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  categoryCode?: string;

  @IsDateString()
  issueDate!: string;

  @ValidateNested()
  @Type(() => ReceivablePayerImportDto)
  payer!: ReceivablePayerImportDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivableInstallmentImportDto)
  installments!: ReceivableInstallmentImportDto[];
}

export class CompanyFinancialSettingsImportDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyValue?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestGracePeriod?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyGracePeriod?: number;
}

export class ReceivablesImportDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsString()
  companyId?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyDocument?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  sourceBatchType!: string;

  @IsString()
  sourceBatchId!: string;

  @IsOptional()
  @IsDateString()
  referenceDate?: string;

  @IsOptional()
  @Allow()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Allow()
  skippedItems?: Array<Record<string, unknown>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyFinancialSettingsImportDto)
  financialSettings?: CompanyFinancialSettingsImportDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivableItemImportDto)
  items!: ReceivableItemImportDto[];
}

export class ExistingBusinessKeysDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsArray()
  @IsString({ each: true })
  businessKeys!: string[];
}

export class ListReceivableBatchesDto {
  @IsOptional()
  @IsString()
  embedded?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceTenantId?: string;

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

export class ListReceivableInstallmentsDto {
  @IsOptional()
  @IsString()
  embedded?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceTenantId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  studentName?: string;

  @IsOptional()
  @IsString()
  payerName?: string;

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

export class UpdateReceivableInstallmentDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class AssignBankToInstallmentsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  bankAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installmentIds!: string[];
}

export class IssueBankSlipsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  bankAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installmentIds!: string[];
}

export class GetInstallmentBankSlipPdfDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class ListBankReturnImportsDto {
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceTenantId?: string;

  @IsOptional()
  @IsString()
  bankAccountId?: string;
}

export class ImportBankReturnDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  bankAccountId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}

export class GetBankReturnImportDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class ApplyBankReturnLiquidationsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}
