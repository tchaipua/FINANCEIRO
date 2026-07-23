import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

const upper = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

export class PrintingScopeDto {
  @IsString()
  @Transform(upper)
  sourceSystem!: string;

  @IsString()
  @Transform(upper)
  sourceTenantId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sourceBranchCode!: number;

  @IsOptional()
  @IsString()
  @Transform(upper)
  userRole?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  requestedBy?: string;
}

export class CreatePrintTemplateDto extends PrintingScopeDto {
  @IsString()
  @Transform(upper)
  @MaxLength(80)
  code!: string;

  @IsString()
  @Transform(upper)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(upper)
  @MaxLength(500)
  description?: string;

  @IsString()
  @Transform(upper)
  @IsIn([
    "SALE_RECEIPT",
    "INSTALLMENT_PAYMENT_RECEIPT",
    "PRODUCT_LABEL",
    "CUSTOM",
  ])
  documentType!: string;

  @IsString()
  @Transform(upper)
  @IsIn(["RECEIPT", "LABEL"])
  mediaType!: string;

  @IsObject()
  layout!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sampleData?: Record<string, unknown>;
}

export class CreatePrintTemplateVersionDto extends PrintingScopeDto {
  @IsObject()
  layout!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  sampleData?: Record<string, unknown>;
}

export class UpdatePrintTemplateDto extends PrintingScopeDto {
  @IsOptional()
  @IsString()
  @Transform(upper)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(upper)
  @MaxLength(500)
  description?: string;
}

export class SavePrinterProfileDto extends PrintingScopeDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @Transform(upper)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(240)
  printerName!: string;

  @IsString()
  @Transform(upper)
  @IsIn(["RECEIPT", "LABEL"])
  printerType!: string;

  @IsOptional()
  @IsString()
  @Transform(upper)
  @IsIn(["WINDOWS", "NETWORK", "USB", "SERIAL"])
  connectionType?: string;

  @IsString()
  @Transform(upper)
  @IsIn(["WINDOWS_DRIVER", "ESC_POS", "PPLA", "PPLB", "PPLZ", "ZPL"])
  language!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(20)
  @Max(220)
  paperWidthMm!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(5)
  @Max(1000)
  paperHeightMm?: number;

  @Type(() => Number)
  @IsInt()
  @Min(16)
  @Max(160)
  columns!: number;

  @Type(() => Number)
  @IsInt()
  @Min(72)
  @Max(1200)
  dpi!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  copies!: number;

  @IsBoolean()
  cutterEnabled!: boolean;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}

export class SavePrintBindingDto extends PrintingScopeDto {
  @IsString()
  @Transform(upper)
  eventType!: string;

  @IsString()
  templateId!: string;

  @IsOptional()
  @IsString()
  templateVersionId?: string;

  @IsOptional()
  @IsString()
  printerProfileId?: string;

  @IsBoolean()
  autoPrint!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  copies!: number;
}

export class PreviewPrintTemplateDto extends PrintingScopeDto {
  @IsObject()
  layout!: Record<string, unknown>;

  @IsObject()
  data!: Record<string, unknown>;
}

export class ValidatePrintPackageDto extends PrintingScopeDto {
  @IsObject()
  package!: Record<string, unknown>;
}

export class ImportPrintPackageDto extends ValidatePrintPackageDto {
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}

export class ExportPrintPackageDto extends PrintingScopeDto {
  @IsOptional()
  @IsString()
  versionId?: string;
}

export class CreateBusinessPrintJobDto extends PrintingScopeDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdatePrintJobStatusDto extends PrintingScopeDto {
  @IsString()
  @Transform(upper)
  @IsIn(["DISPATCHED", "COMPLETED", "FAILED", "CANCELED"])
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  errorMessage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  localPrinterName?: string;
}

export class ListPrintJobsDto extends PrintingScopeDto {
  @IsOptional()
  @IsString()
  @Transform(upper)
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
