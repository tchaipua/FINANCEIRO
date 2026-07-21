import { Type } from "class-transformer";
import {
  IsBoolean,
  IsArray,
  IsIn,
  IsInt,
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

export class SyncSourceIntegrationSettingsDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sourceBranchCode!: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  activeBranchCodes?: number[];

  @IsOptional()
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyDocument?: string;

  @IsOptional()
  @IsString()
  branchName?: string;

  @IsOptional()
  @IsString()
  branchLegalName?: string;

  @IsOptional()
  @IsString()
  branchTradeName?: string;

  @IsOptional()
  @IsString()
  branchDocument?: string;

  @IsOptional()
  @IsString()
  branchStreet?: string;

  @IsOptional()
  @IsString()
  branchNumber?: string;

  @IsOptional()
  @IsString()
  branchComplement?: string;

  @IsOptional()
  @IsString()
  branchNeighborhood?: string;

  @IsOptional()
  @IsString()
  branchCity?: string;

  @IsOptional()
  @IsString()
  branchState?: string;

  @IsOptional()
  @IsString()
  branchPostalCode?: string;

  @IsOptional()
  @IsString()
  branchPhone?: string;

  @IsOptional()
  @IsString()
  branchEmail?: string;

  @IsOptional()
  @IsString()
  s3Endpoint?: string;

  @IsOptional()
  @IsString()
  s3Region?: string;

  @IsOptional()
  @IsString()
  s3Bucket?: string;

  @IsOptional()
  @IsString()
  s3BasePrefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  s3CapacityGb?: number;

  @IsOptional()
  @IsString()
  s3ImagesFolderName?: string;

  @IsOptional()
  @IsString()
  s3AccessKey?: string;

  @IsOptional()
  @IsString()
  s3SecretKey?: string;

  @IsOptional()
  @IsBoolean()
  s3ForcePathStyle?: boolean;

  @IsOptional()
  @IsString()
  storageDefaultAcl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  storageDefaultExpiration?: number;

  @IsOptional()
  @IsString()
  storageSourceScope?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  smtpPort?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  smtpTimeout?: number;

  @IsOptional()
  @IsBoolean()
  smtpAuthenticate?: boolean;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsString()
  smtpAuthType?: string;

  @IsOptional()
  @IsString()
  smtpEmail?: string;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @IsString()
  smtpSourceScope?: string;

  @IsOptional()
  @IsBoolean()
  telegramEnabled?: boolean;

  @IsOptional()
  @IsString()
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  telegramBotUsername?: string;

  @IsOptional()
  @IsString()
  telegramSourceScope?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestGracePeriod?: number | null;

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
  penaltyGracePeriod?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockIntegerQuantityMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockLotControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockExpirationControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockGridControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockNegativeControlMode?: string;

  @IsOptional()
  @IsBoolean()
  allowSaleUnitPriceEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSaleItemDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSameProduct?: boolean;
}

export class SaveCompanyBranchDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  branchCode?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  @IsIn(["TRADITIONAL", "COLOR_SIZE", "LOT"])
  inventoryControlType?: string;

  @IsOptional()
  @IsString()
  @IsIn(["INTEGER_ONLY", "DECIMAL_ALLOWED", "PRODUCT_DEFINED"])
  quantityPrecision?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockIntegerQuantityMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockLotControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockExpirationControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockGridControlMode?: string;

  @IsOptional()
  @IsString()
  @IsIn(["NO", "YES", "BY_PRODUCT"])
  stockNegativeControlMode?: string;

  @IsOptional()
  @IsBoolean()
  allowSaleUnitPriceEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSaleItemDiscount?: boolean;
}

export class SaveSalesScreenParametersDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsBoolean()
  allowSaleUnitPriceEdit?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSaleItemDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  groupSameProduct?: boolean;

}
