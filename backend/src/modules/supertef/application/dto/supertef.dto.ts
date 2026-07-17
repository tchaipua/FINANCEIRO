import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from "class-validator";

function transformBooleanInput(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
  return value;
}

export class SuperTefContextDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceBranchCode!: number;

  @IsOptional()
  @IsString()
  userRole?: string;
}

export class SuperTefMutationContextDto extends SuperTefContextDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;
}

export class SaveSuperTefConfigurationDto extends SuperTefMutationContextDto {
  @IsOptional()
  @IsString()
  companyName?: string;

  @IsString()
  clientKey!: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsString()
  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment!: string;

  @Transform(({ value }) => transformBooleanInput(value))
  @IsBoolean()
  active!: boolean;

  @Transform(({ value }) => transformBooleanInput(value))
  @IsBoolean()
  printReceipt!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(30)
  @Max(300)
  operationTimeoutSeconds!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(15)
  pollIntervalSeconds!: number;
}

export class ChangeSuperTefTerminalStatusDto extends SuperTefMutationContextDto {
  @IsString()
  @IsIn(["ACTIVE", "OUT_OF_SERVICE"])
  operationalStatus!: string;
}

export class SaveSuperTefCheckoutDto extends SuperTefMutationContextDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  terminalIds!: string[];
}

export class ListSuperTefAuditDto extends SuperTefContextDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}

export class CreateSuperTefPaymentDto extends SuperTefMutationContextDto {
  @IsString()
  @MaxLength(100)
  operationId!: string;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  checkoutId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["MANUAL", "SALE", "RECEIVABLE"])
  purpose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  businessReference?: string;

  @IsString()
  @IsIn(["DEBIT", "CREDIT"])
  transactionType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  installmentCount!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsString()
  @MaxLength(100)
  orderId!: string;

  @IsString()
  @MaxLength(200)
  description!: string;
}

export class ListSuperTefPaymentsDto extends SuperTefContextDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
