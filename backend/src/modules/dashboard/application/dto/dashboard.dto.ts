import { IsOptional, IsString } from "class-validator";

export class DashboardOverviewQueryDto {
  @IsOptional()
  @IsString()
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  sourceTenantId?: string;
}
