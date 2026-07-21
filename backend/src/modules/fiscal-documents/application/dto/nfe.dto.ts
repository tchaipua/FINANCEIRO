import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
import { ManualFiscalInstallmentDto } from "./manual-fiscal-receivable.dto";

export class NfeContextDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceBranchCode?: number;

  @IsOptional()
  @IsIn(["HOMOLOGATION", "PRODUCTION"])
  environment?: "HOMOLOGATION" | "PRODUCTION";

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsString()
  userRole?: string;

  @IsOptional()
  @IsString()
  permissions?: string;
}

export class SaveFiscalBranchDto extends NfeContextDto {
  @IsString()
  fiscalLegalName!: string;

  @IsOptional()
  @IsString()
  fiscalTradeName?: string;

  @IsString()
  fiscalDocument!: string;

  @IsString()
  stateRegistration!: string;

  @IsOptional()
  @IsString()
  municipalRegistration?: string;

  @IsIn(["1", "2", "3", "4"])
  taxRegimeCode!: string;

  @IsString()
  fiscalStreet!: string;

  @IsString()
  fiscalNumber!: string;

  @IsOptional()
  @IsString()
  fiscalComplement?: string;

  @IsString()
  fiscalNeighborhood!: string;

  @IsString()
  fiscalCity!: string;

  @IsString()
  fiscalCityCode!: string;

  @IsString()
  fiscalState!: string;

  @IsString()
  fiscalStateCode!: string;

  @IsString()
  fiscalPostalCode!: string;

  @IsOptional()
  @IsString()
  fiscalCountryCode?: string;

  @IsOptional()
  @IsString()
  fiscalCountryName?: string;

  @IsOptional()
  @IsString()
  fiscalPhone?: string;

  @IsOptional()
  @IsEmail()
  fiscalEmail?: string;
}

export class SaveFiscalOperationNatureDto extends NfeContextDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(["55", "65"])
  documentModel?: string;

  @IsIn(["OUTBOUND", "INBOUND"])
  operationType!: string;

  @IsIn(["INTERNAL", "INTERSTATE", "FOREIGN"])
  destinationType!: string;

  @IsIn(["1", "2", "3", "4", "5", "6", "7"])
  purposeCode!: string;

  @IsString()
  cfopCode!: string;

  @IsBoolean()
  finalConsumer!: boolean;

  @IsString()
  presenceIndicator!: string;

  @IsOptional()
  @IsString()
  intermediaryIndicator?: string;

  @IsString()
  freightMode!: string;

  @IsBoolean()
  isDefault!: boolean;

  @IsOptional()
  @IsString()
  additionalInformation?: string;
}

export class SaveFiscalTaxRuleDto extends NfeContextDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  operationNatureId!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsString()
  originCode!: string;

  @IsOptional()
  @IsString()
  icmsCsosnCode?: string;

  @IsOptional()
  @IsString()
  icmsCstCode?: string;

  @IsOptional()
  @IsString()
  icmsBaseMode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  icmsRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  icmsBaseReductionRate?: number;

  @IsOptional()
  @IsString()
  fiscalBenefitCode?: string;

  @IsBoolean()
  fiscalBenefitRequired!: boolean;

  @IsOptional()
  @IsString()
  fiscalBenefitLegalBasis?: string;

  @IsString()
  pisCstCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  pisRate?: number;

  @IsString()
  cofinsCstCode!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cofinsRate?: number;

  @IsOptional()
  @IsString()
  ipiCstCode?: string;

  @IsOptional()
  @IsString()
  ipiFrameworkCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ipiRate?: number;

  @IsBoolean()
  ibsCbsEnabled!: boolean;

  @IsOptional()
  @IsString()
  ibsCbsCstCode?: string;

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
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;
}

export class SaveFiscalBenefitCodeDto extends NfeContextDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  stateCode!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  catalogVersion?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  legalBasis?: string;

  @IsOptional()
  @IsString()
  observations?: string;

  @IsBoolean()
  simpleNationalEligible!: boolean;

  @IsOptional()
  @IsString()
  cstCodes?: string;

  @IsOptional()
  @IsString()
  validFrom?: string;

  @IsOptional()
  @IsString()
  validTo?: string;

  @IsOptional()
  @IsString()
  sourceUrl?: string;
}

export class SaveNfeProfileDto extends NfeContextDto {
  @IsString()
  certificateId!: string;

  @IsOptional()
  @IsString()
  defaultOperationNatureId?: string;

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

  @IsOptional()
  @IsIn(["NORMAL"])
  emissionType?: string;

  @IsOptional()
  @IsIn(["PORTRAIT", "LANDSCAPE"])
  danfeLayout?: string;

  @IsOptional()
  @IsString()
  softwareVersion?: string;

  @IsOptional()
  @IsString()
  schemaVersion?: string;

  @IsOptional()
  @IsString()
  cbenefCatalogVersion?: string;

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

  @IsOptional()
  @IsString()
  additionalInformation?: string;

  @IsOptional()
  @IsString()
  technicalResponsibleCnpj?: string;

  @IsOptional()
  @IsString()
  technicalResponsibleName?: string;

  @IsOptional()
  @IsEmail()
  technicalResponsibleEmail?: string;

  @IsOptional()
  @IsString()
  technicalResponsiblePhone?: string;

  @IsOptional()
  @IsString()
  csrtId?: string;

  @IsOptional()
  @IsString()
  csrtHash?: string;
}

export class IssueSaleNfeDto extends NfeContextDto {
  @IsOptional()
  @IsString()
  operationNatureId?: string;
}

export class ManualNfeItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class IssueManualNfeDto extends NfeContextDto {
  @IsString()
  payerPartyId!: string;

  @IsOptional()
  @IsString()
  operationNatureId?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  idempotencyKey!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ManualNfeItemDto)
  items!: ManualNfeItemDto[];

  @IsIn([
    "CASH",
    "CHECK",
    "CREDIT_CARD",
    "DEBIT_CARD",
    "BOLETO",
    "PIX",
    "TERM",
    "INSTALLMENT",
    "NO_PAYMENT",
    "OTHER",
  ])
  paymentMethod!:
    | "CASH"
    | "CHECK"
    | "CREDIT_CARD"
    | "DEBIT_CARD"
    | "BOLETO"
    | "PIX"
    | "TERM"
    | "INSTALLMENT"
    | "NO_PAYMENT"
    | "OTHER";

  @IsBoolean()
  createReceivable!: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ManualFiscalInstallmentDto)
  installments?: ManualFiscalInstallmentDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class SendNfeEmailDto extends NfeContextDto {
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;
}

export class CancelNfeDto extends NfeContextDto {
  @IsString()
  @MinLength(15)
  justification!: string;
}

export class CorrectNfeDto extends NfeContextDto {
  @IsString()
  @MinLength(15)
  correctionText!: string;
}

export class InutilizeNfeNumbersDto extends NfeContextDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  series!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  startNumber!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endNumber!: number;

  @IsString()
  @MinLength(15)
  justification!: string;
}
