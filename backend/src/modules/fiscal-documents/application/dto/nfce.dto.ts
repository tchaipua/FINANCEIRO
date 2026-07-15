import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class NfceContextDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sourceBranchCode?: number;

  @IsOptional()
  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment?: "HOMOLOGATION" | "PRODUCTION";

  @IsOptional()
  @IsString()
  requestedBy?: string;
}

export class SaveNfceProfileDto extends NfceContextDto {
  @IsString()
  certificateId!: string;

  @IsBoolean()
  autoIssueOnSale!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  series!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  nextNumber!: number;

  @IsString()
  stateCode!: string;

  @IsString()
  cityCode!: string;

  @IsString()
  stateRegistration!: string;

  @IsString()
  legalName!: string;

  @IsOptional()
  @IsString()
  tradeName?: string;

  @IsIn(["1", "2", "3"])
  taxRegimeCode!: "1" | "2" | "3";

  @IsString()
  street!: string;

  @IsString()
  number!: string;

  @IsOptional()
  @IsString()
  complement?: string;

  @IsString()
  neighborhood!: string;

  @IsString()
  city!: string;

  @IsString()
  state!: string;

  @IsString()
  postalCode!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  defaultCfopCode?: string;

  @IsOptional()
  @IsString()
  defaultOriginCode?: string;

  @IsOptional()
  @IsString()
  defaultIcmsCst?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultIcmsRate?: number;

  @IsOptional()
  @IsString()
  defaultPisCst?: string;

  @IsOptional()
  @IsString()
  defaultCofinsCst?: string;

  @IsOptional()
  @IsString()
  ibsCbsCst?: string;

  @IsOptional()
  @IsString()
  ibsCbsClassCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ibsStateRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ibsMunicipalRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cbsRate?: number;

  @IsOptional()
  @IsString()
  additionalInformation?: string;
}

export class IssueSaleNfceDto extends NfceContextDto {}
