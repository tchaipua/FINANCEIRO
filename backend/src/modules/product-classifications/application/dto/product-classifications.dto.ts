import { Type } from "class-transformer";
import { IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class ListProductClassificationsDto {
  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

export class SaveProductGroupDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @IsIn(["ACTIVE", "INACTIVE"])
  status?: string;
}

export class SaveProductSubgroupDto extends SaveProductGroupDto {
  @IsString()
  groupId!: string;
}

export class ChangeProductClassificationStatusDto {
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsString()
  sourceSystem!: string;

  @IsString()
  sourceTenantId!: string;

  @IsString()
  @IsIn(["ACTIVE", "INACTIVE"])
  status!: string;
}
