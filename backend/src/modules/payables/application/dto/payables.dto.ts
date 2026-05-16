import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

function transformBooleanInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "nao", "não"].includes(normalized)) {
    return false;
  }

  return value;
}

export const PAYABLE_INSTALLMENT_STATUSES = ["OPEN", "PAID"] as const;
export const PAYABLE_INSTALLMENT_PAYMENT_METHODS = [
  "CASH",
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHECK",
] as const;

export class ListPayableInvoiceImportsDto {
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
}

export class GetPayableInvoiceImportDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class ImportInvoiceXmlDto {
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
  xmlContent!: string;
}

export class ApprovePayableInvoiceImportItemDto {
  @IsString()
  itemId!: string;

  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  internalCode?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  unitCode?: string;

  @IsOptional()
  @IsString()
  productType?: string;

  @IsOptional()
  @Transform(({ value }) => transformBooleanInput(value))
  @IsBoolean()
  tracksInventory?: boolean;

  @IsOptional()
  @Transform(({ value }) => transformBooleanInput(value))
  @IsBoolean()
  allowFraction?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApprovePayableInvoiceImportDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  approvalNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovePayableInvoiceImportItemDto)
  items?: ApprovePayableInvoiceImportItemDto[];
}

export class UpdatePayableInvoiceImportInstallmentDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  installmentLabel?: string;

  @IsString()
  dueDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsIn(PAYABLE_INSTALLMENT_STATUSES)
  status?: (typeof PAYABLE_INSTALLMENT_STATUSES)[number];

  @IsOptional()
  @IsIn(PAYABLE_INSTALLMENT_PAYMENT_METHODS)
  paymentMethod?: (typeof PAYABLE_INSTALLMENT_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsDateString()
  settledAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePayableInvoiceImportInstallmentsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePayableInvoiceImportInstallmentDto)
  installments!: UpdatePayableInvoiceImportInstallmentDto[];
}
