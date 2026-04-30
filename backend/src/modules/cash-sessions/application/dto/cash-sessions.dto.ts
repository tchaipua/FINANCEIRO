import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Min,
  IsNumber,
} from "class-validator";

export const CASH_SESSION_PAYMENT_METHODS = [
  "CASH",
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "CHECK",
] as const;

export class CurrentCashSessionQueryDto {
  @IsOptional()
  @IsString()
  embedded?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  cashierUserId!: string;

  @IsOptional()
  @IsString()
  cashierDisplayName?: string;
}

export class ListCashSessionsDto {
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

export class OpenCashSessionDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  cashierUserId!: string;

  @IsString()
  cashierDisplayName!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCurrentCashSessionDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  cashierUserId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  declaredClosingAmount?: number;

  @IsOptional()
  @IsDateString()
  closedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export const CASH_SESSION_MANUAL_MOVEMENT_TYPES = [
  "ENTRY",
  "EXIT",
  "ADJUSTMENT",
] as const;

export const CASH_SESSION_MANUAL_MOVEMENT_DIRECTIONS = ["IN", "OUT"] as const;

export class CreateCashMovementDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  cashierUserId!: string;

  @IsIn(CASH_SESSION_MANUAL_MOVEMENT_TYPES)
  movementType!: (typeof CASH_SESSION_MANUAL_MOVEMENT_TYPES)[number];

  @IsIn(CASH_SESSION_MANUAL_MOVEMENT_DIRECTIONS)
  direction!: (typeof CASH_SESSION_MANUAL_MOVEMENT_DIRECTIONS)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class BaseSettleInstallmentDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  cashierUserId!: string;

  @IsString()
  cashierDisplayName!: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettleCashInstallmentDto extends BaseSettleInstallmentDto {}

export class SettleManualInstallmentDto extends BaseSettleInstallmentDto {
  @IsIn(CASH_SESSION_PAYMENT_METHODS)
  paymentMethod!: (typeof CASH_SESSION_PAYMENT_METHODS)[number];
}
