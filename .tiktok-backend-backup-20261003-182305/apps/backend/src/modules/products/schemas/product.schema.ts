import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ _id: false })
export class ProductVariant {
  @Prop({ required: true }) size!: string;
  @Prop({ required: true }) color!: string;
  @Prop({ required: true, min: 0 }) stock!: number;
}
export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);

@Schema({ timestamps: true })
export class Product {
  @Prop({ required: true, unique: true, trim: true }) sku!: string;
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ required: true, trim: true, index: true }) category!: string;
  @Prop({ required: true, min: 0 }) priceVnd!: number;
  @Prop({ required: true }) sourceUrl!: string;
  @Prop() affiliateUrl?: string;
  @Prop({ enum: ['NOT_SET', 'READY', 'PAUSED'], default: 'NOT_SET' }) affiliateStatus!: string;
  @Prop() tiktokProductId?: string;
  @Prop({ min: 0, max: 100 }) estimatedCommissionRatePct?: number;
  @Prop() imageUrl?: string;
  @Prop({ type: [ProductVariantSchema], default: [] }) variants!: ProductVariant[];
  @Prop() trendEvidenceUrl?: string;
  @Prop() trendCheckedAt?: Date;
}
export const ProductSchema = SchemaFactory.createForClass(Product);
