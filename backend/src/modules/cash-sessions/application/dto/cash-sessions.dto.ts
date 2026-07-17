import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
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
  "CUSTOMER_CREDIT",
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
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  receivedAmount?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class SettleCashInstallmentDto extends BaseSettleInstallmentDto {}

export class SettleManualInstallmentDto extends BaseSettleInstallmentDto {
  @IsIn(CASH_SESSION_PAYMENT_METHODS)
  paymentMethod!: (typeof CASH_SESSION_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  settlementGroupId?: string;

  @IsOptional()
  @IsString()
  bankAccountId?: string;

  @IsOptional()
  @IsString()
  bankMovementGroupId?: string;

  @IsOptional()
  @IsString()
  customerCreditId?: string;

  @IsOptional()
  @IsString()
  superTefPaymentId?: string;

  @IsOptional()
  @IsString()
  receivablePixIntentId?: string;
}

export class ReceivablePixIntentContextDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;
}

export class CreateReceivablePixIntentDto extends ReceivablePixIntentContextDto {
  @IsString()
  operationId!: string;

  @IsString()
  settlementGroupId!: string;

  @IsString()
  bankAccountId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  installmentIds!: string[];

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export const INSTALLMENT_SETTLEMENT_HISTORY_STATUSES = ["ACTIVE", "INACTIVE", "ALL"] as const;

export class ListInstallmentSettlementHistoryDto {
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
  @IsIn(INSTALLMENT_SETTLEMENT_HISTORY_STATUSES)
  status?: (typeof INSTALLMENT_SETTLEMENT_HISTORY_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;
}

export class ReverseSettlementGroupDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  cashierUserId?: string;

  @IsOptional()
  @IsString()
  cashierDisplayName?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export const CUSTOMER_CREDIT_STATUSES = ["OPEN", "USED", "CANCELED", "ALL"] as const;

export class ListCustomerCreditsDto {
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
  @IsIn(CUSTOMER_CREDIT_STATUSES)
  status?: (typeof CUSTOMER_CREDIT_STATUSES)[number];

  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateCustomerCreditDto {
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

  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  customerDocument?: string;

  @IsOptional()
  @IsString()
  partyId?: string;

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

export class ReverseManualSettlementDto {
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
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelCashMovementDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  cashierUserId?: string;

  @IsOptional()
  @IsString()
  cashierDisplayName?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
