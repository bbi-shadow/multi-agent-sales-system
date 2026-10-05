import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) priceVnd?: number;
  @IsOptional() @IsUrl({ require_tld: false }) sourceUrl?: string;
  @IsOptional() @IsUrl({ require_tld: false }) affiliateUrl?: string;
  @IsOptional() @IsEnum(['NOT_SET', 'READY', 'PAUSED']) affiliateStatus?: string;
  @IsOptional() @IsString() tiktokProductId?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) estimatedCommissionRatePct?: number;
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) trendEvidenceUrl?: string;
  @IsOptional() @IsDateString() trendCheckedAt?: string;
}
