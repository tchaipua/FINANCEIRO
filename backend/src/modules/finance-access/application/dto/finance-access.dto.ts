import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
  Matches,
  ValidateNested,
} from "class-validator";
import { FINANCE_PERMISSION_CODES, FINANCE_PROFILES } from "../../../../common/finance-access-policy";

export class SynchronizeFinanceAccessSubjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  externalUserId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  centralIdentityAccountId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  registeredPersonId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: "INFORME UM CPF COM 11 DÍGITOS." })
  document?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  displayName!: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  sourceRole?: string;

  @IsBoolean()
  active!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  branchCodes!: number[];
}

export class SynchronizeFinanceAccessSubjectsDto {
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => SynchronizeFinanceAccessSubjectDto)
  subjects!: SynchronizeFinanceAccessSubjectDto[];
}

export class SaveFinanceAccessAssignmentDto {
  @IsString()
  @IsIn(FINANCE_PROFILES.map((profile) => profile.code))
  profileCode!: string;

  @IsArray()
  @ArrayMaxSize(FINANCE_PERMISSION_CODES.length)
  @IsIn(FINANCE_PERMISSION_CODES, { each: true })
  permissionCodes!: string[];

  @IsBoolean()
  active!: boolean;
}

export class ResolveFinanceSystemPersonDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: "INFORME UM CPF COM 11 DÍGITOS." })
  document!: string;
}

export class CreateFinanceSystemUserDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: "INFORME UM CPF COM 11 DÍGITOS." })
  document!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Matches(/^\S+$/, { message: "O LOGIN NÃO PODE CONTER ESPAÇOS." })
  login!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(10)
  confirmationPin!: string;

  @IsString()
  @IsIn(["ADMIN", "SECRETARIA", "COORDENACAO"])
  sourceRole!: string;

  @IsString()
  @IsIn(["ADMIN_TOTAL", "SECRETARIA_PADRAO", "COORDENACAO_PEDAGOGICA"])
  sourceAccessProfile!: string;

  @IsString()
  @IsIn(FINANCE_PROFILES.map((profile) => profile.code))
  financeProfileCode!: string;

  @IsArray()
  @ArrayMaxSize(FINANCE_PERMISSION_CODES.length)
  @IsIn(FINANCE_PERMISSION_CODES, { each: true })
  financePermissionCodes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: "INFORME UM CEP COM 8 DÍGITOS." })
  zipCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "INFORME A UF COM 2 LETRAS." })
  state?: string;
}

export class UpdateFinanceSystemUserPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  confirmationPin!: string;
}

export class UpdateFinanceSystemUserPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;
}
