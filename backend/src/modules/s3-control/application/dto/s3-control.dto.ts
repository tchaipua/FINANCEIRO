import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

function booleanInput(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "sim", "yes"].includes(normalized)) return true;
  if (["false", "0", "nao", "não", "no"].includes(normalized)) return false;
  return value;
}

export class S3ControlContextDto {
  @IsString() sourceSystem!: string;
  @IsString() sourceTenantId!: string;
  @Type(() => Number) @IsInt() @Min(1) sourceBranchCode!: number;
  @IsOptional() @IsString() userRole?: string;
}

export class S3ControlMutationContextDto extends S3ControlContextDto {
  @IsOptional() @IsString() requestedBy?: string;
}

export class SaveS3ConfigurationDto extends S3ControlMutationContextDto {
  @IsOptional() @IsString() @MaxLength(180) companyName?: string;
  @IsOptional() @IsString() @MaxLength(300) endpoint?: string;
  @IsString() @MaxLength(80) region!: string;
  @IsString() @MaxLength(255) bucket!: string;
  @IsString() @MaxLength(600) basePrefix!: string;
  @IsOptional() @IsString() @MaxLength(500) accessKey?: string;
  @IsOptional() @IsString() @MaxLength(1000) secretKey?: string;
  @Transform(({ value }) => booleanInput(value)) @IsBoolean() active!: boolean;
  @Transform(({ value }) => booleanInput(value)) @IsBoolean() forcePathStyle!: boolean;
}

export class ListS3ObjectsDto extends S3ControlContextDto {
  @IsOptional() @IsString() @MaxLength(600) prefix?: string;
  @IsOptional() @IsString() @MaxLength(3000) continuationToken?: string;
}

export class S3FolderStatusDto extends S3ControlContextDto {
  @IsString() @MaxLength(600) prefix!: string;
}

export class SearchS3ObjectsDto extends S3ControlContextDto {
  @IsOptional() @IsString() @MaxLength(255) term?: string;
  @IsOptional() @IsString() @MaxLength(30) extension?: string;
}

export class CreateS3FolderDto extends S3ControlMutationContextDto {
  @IsOptional() @IsString() @MaxLength(600) prefix?: string;
  @IsString() @MaxLength(255) name!: string;
}

export class UploadS3ObjectDto extends S3ControlMutationContextDto {
  @IsOptional() @IsString() @MaxLength(600) prefix?: string;
}

export class DeleteS3FolderDto extends S3ControlMutationContextDto {
  @IsString() @MaxLength(600) prefix!: string;
}

export class DeleteS3ObjectDto extends S3ControlMutationContextDto {
  @IsString() @MaxLength(1000) key!: string;
}
