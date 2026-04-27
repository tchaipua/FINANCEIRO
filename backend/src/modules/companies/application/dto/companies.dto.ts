import { Type } from "class-transformer";
import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class ListCompaniesDto {
  @IsOptional()
  @IsString()
  embedded?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceTenantId?: string;

  @IsOptional()
  @IsString()
  cashierUserId?: string;

  @IsOptional()
  @IsString()
  cashierDisplayName?: string;
}

export class SyncCompanyFinancialSettingsDto {
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

export class UpdateCompanyFinancialSettingsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyValue?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestGracePeriod?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  penaltyGracePeriod?: number | null;
}
