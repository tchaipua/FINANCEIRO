import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { FINANCIAL_NOTIFICATION_EVENT_CODES } from "../../domain/financial-notification-events";

export class FinancialNotificationPreferenceDto {
  @IsString()
  @IsIn(FINANCIAL_NOTIFICATION_EVENT_CODES)
  eventType!: string;

  @IsBoolean()
  enabled!: boolean;

  @IsBoolean()
  sendInternal!: boolean;

  @IsBoolean()
  sendEmail!: boolean;

  @IsBoolean()
  sendTelegram!: boolean;
}

export class SaveFinancialNotificationPreferencesDto {
  @IsArray()
  @ArrayMaxSize(FINANCIAL_NOTIFICATION_EVENT_CODES.length)
  @ValidateNested({ each: true })
  @Type(() => FinancialNotificationPreferenceDto)
  preferences!: FinancialNotificationPreferenceDto[];
}

export class SimulateFinancialNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  subjectId!: string;

  @IsOptional()
  @IsString()
  @IsIn(FINANCIAL_NOTIFICATION_EVENT_CODES)
  eventType?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  recipientEmailOverride?: string;
}

export class DispatchFinancialNotificationDto {
  @IsString()
  @IsIn(FINANCIAL_NOTIFICATION_EVENT_CODES)
  eventType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eventKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
