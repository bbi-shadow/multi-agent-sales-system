import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateLeadDto {
  @IsString() fullName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() industry?: string;
  @IsOptional() @IsEnum(['MANUAL', 'CSV', 'WEBSITE_FORM', 'CRM']) source?: string;
  @IsOptional() @IsEnum(['GRANTED', 'NOT_GRANTED', 'UNKNOWN']) consentStatus?: string;
}
