import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { NfeContextDto } from "./nfe.dto";
import { ManualFiscalInstallmentDto } from "./manual-fiscal-receivable.dto";

export class NfseContextDto extends NfeContextDto {}

export class SaveNfseProfileDto extends NfseContextDto {
  @IsString()
  certificateId!: string;

  @IsOptional()
  @IsString()
  defaultServiceItemId?: string;

  @IsBoolean()
  autoIssueOnSale!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(49999)
  series!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999999999999)
  nextNumber!: number;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  softwareVersion?: string;

  @IsOptional()
  @IsIn(["1.01"])
  schemaVersion?: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  simpleNationalOption!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3])
  simpleNationalTaxRegime?: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([0, 1, 2, 3, 4, 5, 6, 9])
  specialTaxRegime!: number;

  @IsBoolean()
  sendEmailToRecipient!: boolean;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsOptional()
  @IsBoolean()
  smtpAuthenticate?: boolean;

  @IsOptional()
  @IsString()
  smtpUsername?: string;

  @IsOptional()
  @IsString()
  smtpPassword?: string;

  @IsOptional()
  @IsEmail()
  smtpFromEmail?: string;

  @IsOptional()
  @IsString()
  smtpFromName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  smtpTimeoutSeconds?: number;

  @IsOptional()
  @IsEmail()
  homologationEmailRecipient?: string;
}

export class SaveNfseServiceItemDto extends NfseContextDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  internalCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(2000, { each: true })
  descriptions?: string[];

  @IsOptional()
  @IsString()
  cnaeCode?: string;

  @IsString()
  nationalTaxCode!: string;

  @IsOptional()
  @IsString()
  municipalTaxCode?: string;

  @IsOptional()
  @IsString()
  nbsCode?: string;

  @IsString()
  serviceCityCode!: string;

  @IsIn(["1", "2", "3", "4"])
  issTaxationCode!: string;

  @IsIn(["1", "2", "3"])
  issWithholdingCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  issRate?: number;

  @IsOptional()
  @IsString()
  pisCofinsCst?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  pisRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  cofinsRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  simpleNationalTotalTaxRate?: number;

  @IsOptional()
  @IsBoolean()
  ibsCbsEnabled?: boolean;

  @IsOptional()
  @IsString()
  ibsCbsCst?: string;

  @IsOptional()
  @IsString()
  ibsCbsClassCode?: string;

  @IsBoolean()
  isDefault!: boolean;

  @IsOptional()
  @IsBoolean()
  availableToAllBranches?: boolean;
}

export class SyncNfseMunicipalParametersDto extends NfseContextDto {
  @IsOptional()
  @IsString()
  serviceItemId?: string;

  @IsOptional()
  @IsDateString()
  competence?: string;
}

export class IssueNfseDto extends NfseContextDto {
  @IsString()
  serviceItemId!: string;

  @IsOptional()
  @IsString()
  payerPartyId?: string;

  @IsOptional()
  @IsString()
  receivableTitleId?: string;

  @IsOptional()
  @IsString()
  saleId?: string;

  @IsString()
  sourceEntityType!: string;

  @IsString()
  sourceEntityId!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;

  @IsDateString()
  competence!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deductionAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  createReceivable?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ManualFiscalInstallmentDto)
  installments?: ManualFiscalInstallmentDto[];
}

export class SendNfseEmailDto extends NfseContextDto {
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;
}
