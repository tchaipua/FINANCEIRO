import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsNumber,
  ValidateNested,
  Min,
} from "class-validator";

export class ManualFiscalInstallmentDto {
  @IsDateString()
  dueDate!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;
}

export class ManualFiscalInstallmentsDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ManualFiscalInstallmentDto)
  installments!: ManualFiscalInstallmentDto[];
}
