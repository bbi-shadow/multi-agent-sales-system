import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min, ValidateNested } from 'class-validator';

export class ProductVariantDto {
  @IsString() @IsNotEmpty() size!: string;
  @IsString() @IsNotEmpty() color!: string;
  @IsInt() @Min(0) stock!: number;
}

export class CreateProductDto {
  @IsString() @IsNotEmpty() sku!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() category!: string;
  @IsInt() @Min(0) priceVnd!: number;
  @IsUrl({ require_tld: false }) sourceUrl!: string;
  @IsOptional() @IsUrl({ require_tld: false }) affiliateUrl?: string;
  @IsOptional() @IsString() tiktokProductId?: string;
  @IsOptional() @IsUrl({ require_tld: false }) imageUrl?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ProductVariantDto)
  variants!: ProductVariantDto[];
  @IsOptional() @IsUrl({ require_tld: false }) trendEvidenceUrl?: string;
  @IsOptional() @IsDateString() trendCheckedAt?: string;
}
