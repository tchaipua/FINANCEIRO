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
